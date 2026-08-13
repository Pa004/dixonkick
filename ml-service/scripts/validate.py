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
from app.data import load_history
from app.models.dixon_coles import DixonColes

TEST_SEASONS = [2023, 2024, 2025]
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


def evaluate(df: pd.DataFrame) -> None:
    all_results = []
    for season in TEST_SEASONS:
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
            for b, h, o in zip(best, hit, obs)
        )
        print(
            f"Season {season}: log-loss={ll:.4f}  RPS={rps:.4f}  accuracy={acc:.4f} "
            f"(n={len(obs)})"
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
        print(f"{name:10s} n={len(band):4d}  rate={rate:.3f}  (pred centro {band['best'].mean():.3f})")
    print(f"\nTotal partidos evaluados: {total}")


if __name__ == "__main__":
    data = load_history()
    print(f"Partidos cargados: {len(data)}  |  Ligas: {data['League'].nunique()}  |  Equipos: {data['HomeTeam'].nunique()}")
    evaluate(data)