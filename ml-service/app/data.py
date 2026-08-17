"""Carga de datos historicos de football-data.co.uk."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.models.dixon_coles import MAX_GOALS

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

LEAGUES = {
    "E0": "england",
    "SP1": "spain",
    "I1": "italy",
    "D1": "germany",
    "F1": "france",
    "EC1": "ecuador",
}
# Las 5 ligas europeas comparten el modelo global; EC1 (ESPN) entrena aparte
# con su propio Dixon-Coles y no debe contaminar el artefacto global.
GLOBAL_LEAGUES = {k: v for k, v in LEAGUES.items() if k != "EC1"}
COLS = [
    "Div",
    "Date",
    "HomeTeam",
    "AwayTeam",
    "FTHG",
    "FTAG",
    "FTR",
    "HTHG",
    "HTAG",
    "HTR",
    "HS",
    "AS",
    "HST",
    "AST",
    "HF",
    "AF",
    "HC",
    "AC",
    "HY",
    "AY",
    "HR",
    "AR",
]

# Columnas de conteo por mercado: nombre -> (columna local, columna visita).
# Bookings sigue la regla de SBOBET (amarilla=1, roja=2) y se deriva al cargar.
EVENT_COLS: dict[str, tuple[str, str]] = {
    "corners": ("HC", "AC"),
    "shots_on_target": ("HST", "AST"),
    "fouls": ("HF", "AF"),
}
BOOKINGS_HOME = "BookingsH"
BOOKINGS_AWAY = "BookingsA"


def load_history(
    leagues: dict[str, str] | None = None, data_dir: Path | None = None
) -> pd.DataFrame:
    leagues = leagues if leagues is not None else GLOBAL_LEAGUES
    data_dir = data_dir or DATA_DIR
    frames = []
    for file in sorted(data_dir.glob("*.csv")):
        league_code = file.stem[:-4]
        if league_code not in leagues:
            continue
        # Los CSV de ligas sin mercado de conteo (p. ej. EC1 de ESPN) traen solo
        # marcadores; leer la intersección con COLS y reindexar para que cada
        # modelo filtre con dropna las columnas que le falten.
        present = pd.read_csv(file, nrows=0).columns
        usecols = [c for c in COLS if c in present]
        df = pd.read_csv(file, usecols=usecols)
        df = df.reindex(columns=COLS)
        df["League"] = league_code
        frames.append(df)
    if not frames:
        raise ValueError(
            f"no hay CSVs de {sorted(leagues)} en {data_dir} "
            "(ejecuta scripts/download_data.py o scripts/download_espn_ecuador.py)"
        )
    data = pd.concat(frames, ignore_index=True)
    data["Date"] = pd.to_datetime(data["Date"], dayfirst=True, errors="coerce")
    data = data[(data["Date"].dt.year >= 2000) & (data["Date"].dt.year <= 2030)]
    data["FTHG"] = pd.to_numeric(data["FTHG"], errors="coerce")
    data["FTAG"] = pd.to_numeric(data["FTAG"], errors="coerce")
    # Los huecos de columnas se propagan como NaN; cada modelo filtra las suyas.
    for col in COLS[7:]:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data[BOOKINGS_HOME] = data["HY"] + 2 * data["HR"]
    data[BOOKINGS_AWAY] = data["AY"] + 2 * data["AR"]
    data = data.dropna(subset=["Date", "FTHG", "FTAG", "HomeTeam", "AwayTeam"])
    # Marcadores fuera del soporte del grid (MAX_GOALS) son datos corruptos o de
    # otra disciplina; entrenar con ellos ensucia la correccion tau.
    data = data[(data["FTHG"] <= MAX_GOALS) & (data["FTAG"] <= MAX_GOALS)]
    data["FTHG"] = data["FTHG"].astype(int)
    data["FTAG"] = data["FTAG"].astype(int)
    return data.sort_values("Date").reset_index(drop=True)
