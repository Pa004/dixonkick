"""Entrena Dixon-Coles con todos los datos y guarda los parametros."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.data import load_history
from app.models.dixon_coles import DixonColes

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "dixon_coles.npz"


def main() -> None:
    data = load_history()
    model = DixonColes()
    model.fit(
        data["Date"],
        data["HomeTeam"],
        data["AwayTeam"],
        data["FTHG"],
        data["FTAG"],
    )
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_PATH)
    print(
        f"Modelo guardado en {MODEL_PATH} | equipos={len(model.teams)} "
        f"| gamma={model.gamma:.3f} | rho={model.rho:.4f}"
    )


if __name__ == "__main__":
    main()
