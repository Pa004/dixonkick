"""Tests del enrutado multi-liga de la API (global vs EC1)."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(scope="module")
def booted_app(synthetic_artifacts):
    with TestClient(app) as c:
        yield c


def test_health_reporta_ambos_modelos(booted_app):
    res = booted_app.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert "teams" in body and "teams_ec1" in body


def test_teams_global_vs_ec1(booted_app):
    global_teams = booted_app.get("/teams").json()["teams"]
    ec1_teams = booted_app.get("/teams?league=EC1").json()["teams"]
    assert len(global_teams) > 0
    assert len(ec1_teams) > 0
    assert ec1_teams != global_teams


def test_predict_ec1_con_equipo_ecuatoriano(booted_app):
    teams = booted_app.get("/teams?league=EC1").json()["teams"]
    res = booted_app.post("/predict", json={"home": teams[0], "away": teams[1], "league": "EC1"})
    assert res.status_code == 200
    body = res.json()
    assert body["league"] == "EC1"
    assert body["pick"] in {"H", "D", "A"}
    assert "markets" in body


def test_predict_ec1_404_si_equipo_no_esta(booted_app):
    res = booted_app.post(
        "/predict", json={"home": "Equipo Inexistente", "away": "Otro", "league": "EC1"}
    )
    assert res.status_code == 404


def test_predict_default_usa_modelo_global(booted_app):
    global_teams = booted_app.get("/teams").json()["teams"]
    res = booted_app.post(
        "/predict", json={"home": global_teams[0], "away": global_teams[1], "league": "global"}
    )
    assert res.status_code == 200
    assert res.json()["league"] == "global"


@pytest.mark.parametrize(
    "body",
    [
        {"home": "", "away": "X", "league": "global"},
        {"home": "X", "away": "  ", "league": "global"},
        {"home": "X", "away": "Y", "league": "premier"},
    ],
)
def test_predict_valida_entrada_con_422(booted_app, body):
    res = booted_app.post("/predict", json=body)
    assert res.status_code == 422
