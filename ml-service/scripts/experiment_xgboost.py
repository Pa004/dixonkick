"""Experimento fase 4b: ensamble XGBoost vs Dixon-Coles puro.

Gate de aceptacion: log-loss out-of-sample de DC+XGB <= DC puro - 0.01.
Si no mejora, se descarta y se documenta el resultado.
Features causales (sin leakage): Elo secuencial, forma (pts ultimos 5).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.data import load_history
from app.models.dixon_coles import DixonColes

TEST_SEASONS = [2023, 2024, 2025]
FORM_WINDOW = 5
FEAT_COLS = ["elo_home", "elo_away", "form_home", "form_away"]


def add_form(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["form_home"] = 0.5
    out["form_away"] = 0.5
    last: dict[str, list[float]] = {}
    pts_home = np.select([df["FTHG"] > df["FTAG"], df["FTHG"] == df["FTAG"]], [3, 1], default=0)
    pts_away = np.select([df["FTHG"] > df["FTAG"], df["FTHG"] == df["FTAG"]], [0, 1], default=3)
    for r in range(len(df)):
        for side, pts in (("HomeTeam", pts_home), ("AwayTeam", pts_away)):
            name = df.iloc[r][side]
            hist = last.get(name, [])
            col = f"form_{'home' if side == 'HomeTeam' else 'away'}"
            out.iloc[r, out.columns.get_loc(col)] = np.mean(hist) if hist else 0.5
            hist.append(pts[r])
            del hist[:-FORM_WINDOW]
            last[name] = hist
    return out


def compute_elo(df: pd.DataFrame, k: float = 30, home_adv: float = 70) -> pd.DataFrame:
    teams = sorted(set(df["HomeTeam"]) | set(df["AwayTeam"]))
    idx = {t: i for i, t in enumerate(teams)}
    elo = np.full(len(teams), 1500.0)
    elo_home = np.zeros(len(df))
    elo_away = np.zeros(len(df))
    for r, row in enumerate(df.itertuples(index=False)):
        hi, ai = idx[row.HomeTeam], idx[row.AwayTeam]
        elo_home[r] = elo[hi]
        elo_away[r] = elo[ai]
        e_h = 1 / (1 + 10 ** ((elo[ai] - elo[hi] - home_adv) / 400))
        e_a = 1 - e_h
        s_h = 1.0 if row.FTHG > row.FTAG else 0.5 if row.FTHG == row.FTAG else 0.0
        elo[hi] += k * (s_h - e_h)
        elo[ai] += k * ((1 - s_h) - e_a)
    out = df.copy()
    out["elo_home"] = elo_home
    out["elo_away"] = elo_away
    return out


def make_matrix(df: pd.DataFrame) -> np.ndarray:
    return df[FEAT_COLS].to_numpy()


def probs_to_metrics(probs: np.ndarray, obs: np.ndarray) -> tuple[float, float, float]:
    ll = -np.mean(np.log(np.clip(probs[np.arange(len(obs)), obs], 1e-12, None)))
    rps = np.mean(
        [0.5 * np.sum((np.cumsum(probs[i]) - np.cumsum(np.arange(3) == obs[i])) ** 2) for i in range(len(obs))]
    )
    acc = float(np.mean(probs.argmax(axis=1) == obs))
    return ll, rps, acc


def evaluate(df: pd.DataFrame) -> None:
    summary = {m: [] for m in ("DC", "XGB", "BLEND")}
    for season in TEST_SEASONS:
        train = df[df["Date"].dt.year < season].reset_index(drop=True)
        test = df[df["Date"].dt.year == season].reset_index(drop=True)

        dc = DixonColes()
        dc.fit(train["Date"], train["HomeTeam"], train["AwayTeam"], train["FTHG"], train["FTAG"])
        dc_probs = np.array(
            [[p["home"], p["draw"], p["away"]] for p in
             (dc.predict(h, a)["probabilities"] for h, a in zip(test["HomeTeam"], test["AwayTeam"]))]
        )

        train_elo = compute_elo(train)
        train_form = add_form(train)
        test_form = add_form(test)
        last_elo = dict(
            zip(train_elo["HomeTeam"], train_elo["elo_home"])
        ) | dict(zip(train_elo["AwayTeam"], train_elo["elo_away"]))
        test_form["elo_home"] = test_form["HomeTeam"].map(last_elo).fillna(1500)
        test_form["elo_away"] = test_form["AwayTeam"].map(last_elo).fillna(1500)

        Xtr = make_matrix(train_elo.assign(form_home=train_form["form_home"], form_away=train_form["form_away"]))
        Xte = make_matrix(test_form)
        ytr = np.select(
            [train["FTHG"] > train["FTAG"], train["FTHG"] == train["FTAG"]], [0, 1], default=2
        )
        obs = np.select(
            [test["FTHG"] > test["FTAG"], test["FTHG"] == test["FTAG"]], [0, 1], default=2
        )

        model = xgb.XGBClassifier(
            objective="multi:softprob", num_class=3, n_estimators=200,
            max_depth=4, learning_rate=0.05, subsample=0.8, eval_metric="mlogloss",
        )
        model.fit(Xtr, ytr)
        xgb_probs = model.predict_proba(Xte)

        blend = 0.5 * dc_probs + 0.5 * xgb_probs
        blend /= blend.sum(axis=1, keepdims=True)

        metrics = {name: probs_to_metrics(p, obs) for name, p in
                   [("DC", dc_probs), ("XGB", xgb_probs), ("BLEND", blend)]}
        for name in summary:
            summary[name].append(metrics[name])
        print(
            f"Season {season}: "
            + " | ".join(f"{m} ll={metrics[m][0]:.4f} rps={metrics[m][1]:.4f} acc={metrics[m][2]:.3f}"
                         for m in summary)
        )

    res = {m: np.mean(summary[m], axis=0) for m in summary}
    print("\n--- Promedio 3 temporadas out-of-sample ---")
    print(f"{'modelo':6s} {'log_loss':>8s} {'rps':>7s} {'acc':>6s}")
    for m in summary:
        print(f"{m:6s} {res[m][0]:8.4f} {res[m][1]:7.4f} {res[m][2]:6.3f}")

    gain = res["DC"][0] - res["BLEND"][0]
    print(f"\nGate: BLEND log-loss {res['BLEND'][0]:.4f} vs DC {res['DC'][0]:.4f} -> mejora {gain:+.4f}")
    print("DECISION:", "ACEPTAR ensamble (mejora >= 0.01)" if gain >= 0.01 else "DESCARTAR (no supera el umbral de 0.01)")


if __name__ == "__main__":
    evaluate(load_history())