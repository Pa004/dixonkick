"""Tests de la carga de datos historicos.

Usan un CSV mínimo generado en tmp_path (nunca los datos reales de data/,
que están gitignored) para que los tests sean deterministas y corran en CI.
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.data import (
    BOOKINGS_AWAY,
    BOOKINGS_HOME,
    COLS,
    EVENT_COLS,
    GLOBAL_LEAGUES,
    LEAGUES,
    load_history,
)


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


def write_ec1_minimal_csv(tmp_path: Path) -> Path:
    rows = [
        # CSV de ESPN: solo marcadores, sin stats de conteo ni HT
        ["EC1", "15/02/2025", "Barcelona SC", "Emelec", 2, 1],
        ["EC1", "22/02/2025", "Liga de Quito", "Independiente del Valle", 0, 0],
    ]
    df = pd.DataFrame(rows, columns=["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"])
    path = tmp_path / "EC12025.csv"
    df.to_csv(path, index=False)
    return path


def test_load_history_acepta_csv_minimo_de_espectro(tmp_path):
    write_ec1_minimal_csv(tmp_path)
    data = load_history(leagues={"EC1": "x"}, data_dir=tmp_path)
    assert list(data["League"].unique()) == ["EC1"]
    assert len(data) == 2
    assert data["FTHG"].dtype.kind == "i"
    assert data["FTAG"].dtype.kind == "i"
    # Las columnas de conteo ausentes propagan NaN para que cada modelo filtre
    for col in ["HC", "AC", "HTHG", "HTAG"]:
        assert data[col].isna().all()


def test_default_excluye_ec1_del_modelo_global(tmp_path):
    """El global son las 5 ligas europeas; EC1 entrena aparte (decision del repo)."""
    write_ec1_minimal_csv(tmp_path)
    write_sample_csv(tmp_path)
    data = load_history(data_dir=tmp_path)
    assert "EC1" in LEAGUES and "EC1" not in GLOBAL_LEAGUES
    assert list(data["League"].unique()) == ["E0"]
    # La liga excluida sigue cargable si se pide explicitamente
    both = load_history(leagues={"EC1": "x", "E0": "x"}, data_dir=tmp_path)
    assert set(both["League"].unique()) == {"EC1", "E0"}


def test_guard_lanza_si_no_hay_csv(tmp_path):
    import pytest

    with pytest.raises(ValueError, match="no hay CSVs"):
        load_history(leagues={"ZZ": "x"}, data_dir=tmp_path)


def test_filtra_marcadores_fuera_del_soporte(tmp_path):
    import pandas as pd

    rows = [
        ["E0", "15/08/2025", "Alfa", "Beta", 2, 1],
        ["E0", "22/08/2025", "Beta", "Alfa", 12, 0],  # corrupto: fuera del grid 0..8
    ]
    df = pd.DataFrame(rows, columns=["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"])
    df.to_csv(tmp_path / "E02025.csv", index=False)

    data = load_history(data_dir=tmp_path)
    assert len(data) == 1
    assert data.iloc[0]["FTHG"] == 2
