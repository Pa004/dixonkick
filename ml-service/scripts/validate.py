"""Validacion walk-forward del modelo Dixon-Coles.

Entrena con todos los partidos anteriores a cada temporada de test
y reporta log-loss, RPS, accuracy y calibracion por banda de confianza.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.data import BOOKINGS_AWAY, BOOKINGS_HOME, EVENT_COLS, GLOBAL_LEAGUES, load_history
from app.models.count_model import CountModel, rolling_form
from app.models.dixon_coles import DixonColes

TEST_SEASONS = [2023, 2024, 2025]


def test_seasons_from_data(data: pd.DataFrame) -> list[int]:
    """Ultimas 3 temporadas disponibles; dinamico para no quedarse con años fijos."""
    years = sorted(data["Date"].dt.year.unique())
    if len(years) < 4:
        raise SystemExit(f"necesitas al menos 4 temporadas para el walk-forward; hay {len(years)}")
    return years[-3:]


COUNT_COLS: dict[str, tuple[str, str]] = {
    "corners": EVENT_COLS["corners"],
    "bookings": (BOOKINGS_HOME, BOOKINGS_AWAY),
    "shots_on_target": EVENT_COLS["shots_on_target"],
    "fouls": EVENT_COLS["fouls"],
}
BANDS = [
    ("Seguro", 0.65, 1.01),
    ("Probable", 0.55, 0.65),
    ("Ajustado", 0.45, 0.55),
    ("Incierto", 0.0, 0.45),
]


def rps_one(pred: np.ndarray, obs: int) -> float:
    cdf_pred = np.cumsum(pred)
    cdf_obs = np.cumsum(np.arange(3) == obs)
    return float(0.5 * np.sum((cdf_pred - cdf_obs) ** 2))


def evaluate_counts(df: pd.DataFrame, seasons: list[int]) -> None:
    """Walk-forward de los conteos: log-loss del total frente al baseline empirico."""
    for name, (hcol, acol) in COUNT_COLS.items():
        rows = df.dropna(subset=[hcol, acol]).sort_values("Date").reset_index(drop=True)
        # Forma reciente disponible en cada momento (causal, sin mirar el futuro).
        home_form, away_form, _ = rolling_form(
            rows["Date"], rows["HomeTeam"], rows["AwayTeam"], rows[hcol], rows[acol]
        )
        total_ll = 0.0
        base_ll = 0.0
        n = 0
        for season in seasons:
            train = rows[rows["Date"].dt.year < season]
            test = rows[rows["Date"].dt.year == season]
            if len(test) == 0:
                continue
            model = CountModel()
            model.fit(
                train["Date"],
                train["HomeTeam"],
                train["AwayTeam"],
                train[hcol],
                train[acol],
            )
            train_total = (train[hcol] + train[acol]).to_numpy(dtype=int)
            n_bins = int(train_total.max()) + 1 if len(train_total) else 1
            base = (np.bincount(train_total, minlength=n_bins) + 1) / (len(train_total) + n_bins)
            test_pos = test.index.to_numpy()
            season_ll = 0.0
            season_base = 0.0
            season_n = 0
            for i, row in enumerate(test.itertuples(index=False)):
                pos = test_pos[i]
                pred = model.predict(
                    row.HomeTeam, row.AwayTeam, form_home=home_form[pos], form_away=away_form[pos]
                )
                total = np.convolve(pred["pmf_home"], pred["pmf_away"])
                obs = int(getattr(row, hcol) + getattr(row, acol))
                if obs >= total.size or obs >= base.size:
                    continue
                season_ll += -np.log(np.clip(total[obs], 1e-12, None))
                season_base += -np.log(np.clip(base[obs], 1e-12, None))
                season_n += 1
            if season_n == 0:
                continue
            skill = 1 - season_ll / season_base
            print(
                f"{name:15s} season {season}: log-loss={season_ll / season_n:.4f}  "
                f"baseline={season_base / season_n:.4f}  skill={skill:+.1%} (n={season_n})"
            )
            total_ll += season_ll
            base_ll += season_base
            n += season_n
        if n:
            skill = 1 - total_ll / base_ll
            print(
                f"{name:15s} TOTAL: log-loss={total_ll / n:.4f}  "
                f"baseline={base_ll / n:.4f}  skill={skill:+.1%} (n={n})"
            )
    print()


def evaluate(df: pd.DataFrame, seasons: list[int]) -> None:
    all_results = []
    for season in seasons:
        train = df[df["Date"].dt.year < season]
        test = df[df["Date"].dt.year == season]
        model = DixonColes()
        model.fit(
            train["Date"],
            train["HomeTeam"],
            train["AwayTeam"],
            train["FTHG"],
            train["FTAG"],
        )
        preds = []
        for row in test.itertuples(index=False):
            p = model.predict(row.HomeTeam, row.AwayTeam)
            preds.append(p["probabilities"])
        pred_df = pd.DataFrame(preds)
        obs = np.select(
            [test["FTHG"] > test["FTAG"], test["FTHG"] == test["FTAG"]],
            [0, 1],
            default=2,
        )
        pred_arr = pred_df[["home", "draw", "away"]].to_numpy()
        ll = -np.mean(np.log(np.clip(pred_arr[np.arange(len(obs)), obs], 1e-12, None)))
        rps = np.mean([rps_one(pred_arr[i], obs[i]) for i in range(len(obs))])
        acc = float(np.mean(pred_arr.argmax(axis=1) == obs))
        best = pred_arr.max(axis=1)
        hit = pred_arr.argmax(axis=1) == obs
        all_results.extend(
            {"season": season, "best": b, "hit": int(h), "actual": int(o)}
            for b, h, o in zip(best, hit, obs, strict=True)
        )
        print(
            f"Season {season}: log-loss={ll:.4f}  RPS={rps:.4f}  accuracy={acc:.4f} (n={len(obs)})"
        )

    res = pd.DataFrame(all_results)
    print("\n--- Calibracion por banda de confianza ---")
    total = 0
    for name, lo, hi in BANDS:
        band = res[(res["best"] >= lo) & (res["best"] < hi)]
        if len(band) == 0:
            continue
        rate = band["hit"].mean()
        total += len(band)
        print(
            f"{name:10s} n={len(band):4d}  rate={rate:.3f}  (pred centro {band['best'].mean():.3f})"
        )
    print(f"\nTotal partidos evaluados: {total}")


if __name__ == "__main__":
    data = load_history(leagues=GLOBAL_LEAGUES)
    print(
        f"Partidos cargados: {len(data)}  |  Ligas: {data['League'].nunique()}  |  Equipos: {data['HomeTeam'].nunique()}"
    )
    seasons = test_seasons_from_data(data)
    evaluate(data, seasons)
    print("\n--- Mercados de conteo (corners, bookings, tiros, faltas) ---")
    evaluate_counts(data, seasons)
