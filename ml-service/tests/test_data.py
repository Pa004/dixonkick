"""Tests de la carga ampliada de datos historicos."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.data import BOOKINGS_AWAY, BOOKINGS_HOME, EVENT_COLS, load_history


def test_load_history_ampliada():
    data = load_history()
    assert {"HTHG", "HTAG", "HTR", "HC", "AC", "HY", "AY", "HR", "AR"} <= set(data.columns)
    assert "FTHG" in data.columns and "FTAG" in data.columns
    assert data["FTHG"].dtype.kind == "i"
    assert data["FTHG"].min() >= 0


def test_bookings_points_derivados():
    data = load_history()
    ok = data.dropna(subset=["HY", "HR"])
    if len(ok):
        sample = ok.iloc[0]
        expected = sample["HY"] + 2 * sample["HR"]
        assert data.loc[sample.name, BOOKINGS_HOME] == expected
    assert BOOKINGS_AWAY in data.columns


def test_nan_propaga_en_columnas_de_evento():
    data = load_history()
    for col in EVENT_COLS["corners"]:
        assert data[col].dtype.kind == "f"  # float para permitir NaN


def test_eventos_sin_valores_negativos():
    data = load_history()
    for col in ["HTHG", "HTAG", "HC", "AC"]:
        if data[col].notna().any():
            assert data[col].dropna().min() >= 0
