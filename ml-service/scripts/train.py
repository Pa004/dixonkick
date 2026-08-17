"""Entrena los modelos de mercados y guarda los artefactos.

Modelos: Dixon-Coles para FT y para la primera mitad, Negativo-Binomial por
mercado de conteo (corners, bookings, tiros a puerta, faltas) y la condicional
empirica HT/FT (P(FT | HT)) con decaimiento temporal.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.data import BOOKINGS_AWAY, BOOKINGS_HOME, EVENT_COLS, GLOBAL_LEAGUES, load_history
from app.models.count_model import CountModel
from app.models.dixon_coles import DEFAULT_DECAY, DixonColes

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"

COUNT_ARTIFACTS: dict[str, tuple[str, str]] = {
    "corners": EVENT_COLS["corners"],
    "bookings": (BOOKINGS_HOME, BOOKINGS_AWAY),
    "shots_on_target": EVENT_COLS["shots_on_target"],
    "fouls": EVENT_COLS["fouls"],
}


def htft_conditional(data: pd.DataFrame, decay: float) -> np.ndarray:
    """Matriz 3x3 (filas=HT, cols=FT) ponderada por decaimiento temporal."""
    rows = data.dropna(subset=["HTHG", "HTAG"])
    ht = np.select(
        [rows["HTHG"] > rows["HTAG"], rows["HTHG"] == rows["HTAG"]],
        [0, 1],
        default=2,
    )
    ft = np.select(
        [rows["FTHG"] > rows["FTAG"], rows["FTHG"] == rows["FTAG"]],
        [0, 1],
        default=2,
    )
    ref = rows["Date"].max()
    age = (ref - rows["Date"]).dt.days.to_numpy(dtype=float)
    weights = np.exp(-decay * age)
    joint = np.zeros((3, 3))
    np.add.at(joint, (ht, ft), weights)
    cond = joint / joint.sum(axis=1, keepdims=True)
    cond[np.isnan(cond)] = 1.0 / 3.0
    return cond


def train_league(code: str) -> None:
    """Modelo Dixon-Coles FT exclusivo para una liga (p. ej. EC1).

    Los CSV de esa liga deben existir en data/. No toca los artefactos globales.
    """
    data = load_history(leagues={code: "x"})
    if data.empty:
        raise SystemExit(f"no hay datos para {code} en data/")
    ft = DixonColes()
    ft.fit(data["Date"], data["HomeTeam"], data["AwayTeam"], data["FTHG"], data["FTAG"])
    out = ARTIFACT_DIR / f"dixon_coles_{code.lower()}.npz"
    ft.save(out)
    print(
        f"{code}: equipos={len(ft.teams)} gamma={ft.gamma:.3f} rho={ft.rho:.4f} "
        f"n={ft.n_matches} -> {out.name}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Entrena los modelos de mercados.")
    parser.add_argument(
        "--league",
        default=None,
        help="código de liga para entrenar SOLO su Dixon-Coles FT "
        "(p. ej. EC1); sin flag entrena todo el pipeline global",
    )
    args = parser.parse_args()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    if args.league:
        train_league(args.league.upper())
        return

    data = load_history(leagues=GLOBAL_LEAGUES)
    if data.empty:
        raise SystemExit(f"no hay datos para el modelo global en data/ ({GLOBAL_LEAGUES})")

    ft = DixonColes()
    ft.fit(data["Date"], data["HomeTeam"], data["AwayTeam"], data["FTHG"], data["FTAG"])
    ft.save(ARTIFACT_DIR / "dixon_coles.npz")
    print(f"FT: equipos={len(ft.teams)} gamma={ft.gamma:.3f} rho={ft.rho:.4f} n={ft.n_matches}")

    ht_rows = data.dropna(subset=["HTHG", "HTAG"])
    ht = DixonColes()
    ht.fit(
        ht_rows["Date"],
        ht_rows["HomeTeam"],
        ht_rows["AwayTeam"],
        ht_rows["HTHG"],
        ht_rows["HTAG"],
    )
    ht.save(ARTIFACT_DIR / "dixon_coles_ht.npz")
    print(f"HT: equipos={len(ht.teams)} gamma={ht.gamma:.3f} rho={ht.rho:.4f} n={ht.n_matches}")

    for name, (hcol, acol) in COUNT_ARTIFACTS.items():
        rows = data.dropna(subset=[hcol, acol])
        model = CountModel()
        model.fit(rows["Date"], rows["HomeTeam"], rows["AwayTeam"], rows[hcol], rows[acol])
        model.save(ARTIFACT_DIR / f"{name}.npz")
        print(
            f"{name}: equipos={len(model.teams)} gamma={model.gamma:.3f} "
            f"alpha_od={model.alpha_od:.3f} n={model.n_matches}"
        )

    cond = htft_conditional(data, DEFAULT_DECAY)
    np.savez(
        ARTIFACT_DIR / "htft_cond.npz",
        cond=cond,
        saved_at=np.array([np.datetime64("now", "s")]),
    )
    print("condicional HT/FT guardada")


if __name__ == "__main__":
    main()
