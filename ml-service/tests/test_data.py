"""Tests de la carga de datos historicos.

Usan un CSV mínimo generado en tmp_path (nunca los datos reales de data/,
que están gitignored) para que los tests sean deterministas y corran en CI.
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.data import BOOKINGS_AWAY, BOOKINGS_HOME, COLS, EVENT_COLS, load_history


def write_sample_csv(tmp_path: Path) -> Path:
    rows = [
        # Div, Date, HomeTeam, AwayTeam, FTHG, FTAG, FTR, HTHG, HTAG, HTR, HS, AS, HST, AST, HF, AF, HC, AC, HY, AY, HR, AR
        [
            "E0",
            "15/08/2025",
            "Alfa",
            "Beta",
            2,
            1,
            "H",
            1,
            0,
            "H",
            12,
            9,
            5,
            3,
            11,
            10,
            6,
            4,
            2,
            1,
            0,
            0,
        ],
        [
            "E0",
            "22/08/2025",
            "Beta",
            "Alfa",
            0,
            0,
            "D",
            0,
            0,
            "D",
            10,
            8,
            2,
            4,
            12,
            9,
            None,
            None,
            1,
            2,
            0,
            0,
        ],
    ]
    df = pd.DataFrame(rows, columns=COLS)
    path = tmp_path / "E02025.csv"
    df.to_csv(path, index=False)
    return path


def test_load_history_ampliada(tmp_path):
    write_sample_csv(tmp_path)
    data = load_history(data_dir=tmp_path)
    assert {"HTHG", "HTAG", "HTR", "HC", "AC", "HY", "AY", "HR", "AR"} <= set(data.columns)
    assert "FTHG" in data.columns and "FTAG" in data.columns
    assert data["FTHG"].dtype.kind == "i"
    assert data["FTHG"].min() >= 0


def test_bookings_points_derivados(tmp_path):
    write_sample_csv(tmp_path)
    data = load_history(data_dir=tmp_path)
    ok = data.dropna(subset=["HY", "HR"])
    if len(ok):
        sample = ok.iloc[0]
        expected = sample["HY"] + 2 * sample["HR"]
        assert data.loc[sample.name, BOOKINGS_HOME] == expected
    assert BOOKINGS_AWAY in data.columns


def test_nan_propaga_en_columnas_de_evento(tmp_path):
    write_sample_csv(tmp_path)
    data = load_history(data_dir=tmp_path)
    for col in EVENT_COLS["corners"]:
        # to_numeric con huecos (None en el CSV) produce float para permitir NaN
        assert data[col].dtype.kind == "f"
        assert data[col].isna().any()


def test_eventos_sin_valores_negativos(tmp_path):
    write_sample_csv(tmp_path)
    data = load_history(data_dir=tmp_path)
    for col in ["HTHG", "HTAG", "HC", "AC"]:
        if data[col].notna().any():
            assert data[col].dropna().min() >= 0
