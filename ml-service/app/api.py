"""Servicio FastAPI: predicciones de mercados (Dixon-Coles FT/HT + conteos)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.models import markets
from app.models.count_model import CountModel
from app.models.dixon_coles import DixonColes, confidence_bands

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"

FT_LINES = [0.5, 1.5, 2.5, 3.5, 4.5]
AH_LINES = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5]
TEAM_TOTAL_LINES = [0.5, 1.5, 2.5]
HT_LINES = [0.5, 1.5]

# mercado -> (lineas total, lineas total por equipo, lineas handicap)
COUNT_GROUPS: dict[str, tuple[list[float], list[float], list[float]]] = {
    "corners": ([8.5, 9.5, 10.5], [3.5, 4.5, 5.5], [-2.5, -1.5]),
    "bookings": ([3.5, 4.5, 5.5], [1.5, 2.5], [-1.5, -0.5]),
    "shots_on_target": ([8.5], [3.5, 4.5], [-2.5, -1.5]),
    "fouls": ([20.5, 22.5], [9.5, 10.5], [-2.5]),
}


class Models:
    def __init__(self) -> None:
        self.ft: DixonColes | None = None
        self.ft_ec1: DixonColes | None = None
        self.ht: DixonColes | None = None
        self.htft_cond: np.ndarray | None = None
        self.counts: dict[str, CountModel] = {}
        self.trained_at: str | None = None

    def load(self) -> None:
        saved: list[float] = []
        ft_path = ARTIFACT_DIR / "dixon_coles.npz"
        if ft_path.exists():
            self.ft = DixonColes.load(ft_path)
            saved.append(_saved_at(ft_path))
        # Modelo por-liga opcional (Liga Pro). Sin el, /predict devuelve 503
        # solo para esa liga; el global no se ve afectado.
        ec1_path = ARTIFACT_DIR / "dixon_coles_ec1.npz"
        if ec1_path.exists():
            self.ft_ec1 = DixonColes.load(ec1_path)
            saved.append(_saved_at(ec1_path))
        ht_path = ARTIFACT_DIR / "dixon_coles_ht.npz"
        if ht_path.exists():
            self.ht = DixonColes.load(ht_path)
            saved.append(_saved_at(ht_path))
        for name in COUNT_GROUPS:
            path = ARTIFACT_DIR / f"{name}.npz"
            if path.exists():
                self.counts[name] = CountModel.load(path)
                saved.append(_saved_at(path))
        cond_path = ARTIFACT_DIR / "htft_cond.npz"
        if cond_path.exists():
            with np.load(cond_path) as data:
                self.htft_cond = data["cond"]
            saved.append(_saved_at(cond_path))
        if saved:
            newest = max(saved)
            self.trained_at = datetime.fromtimestamp(newest, UTC).isoformat()


def _saved_at(path: Path) -> float:
    """Segundos desde epoch del saved_at del artefacto (0 si no lo trae)."""
    with np.load(path) as data:
        raw = data.get("saved_at")
        if raw is None:
            return 0.0
        return float(np.datetime64(raw[0]).astype("datetime64[s]").astype("int64"))


models = Models()


class Fixture(BaseModel):
    home: str
    away: str
    league: str = "global"


def select_model(league: str) -> DixonColes:
    """Modelo FT para la liga. EC1 usa su modelo por-liga; el resto, el global."""
    if league == "EC1":
        if models.ft_ec1 is None:
            raise HTTPException(status_code=503, detail="modelo EC1 no cargado")
        return models.ft_ec1
    if models.ft is None:
        raise HTTPException(status_code=503, detail="modelo base no cargado")
    return models.ft


@asynccontextmanager
async def lifespan(_app: FastAPI):
    models.load()
    if models.ft is None:
        raise RuntimeError(
            f"Modelo base no encontrado en {ARTIFACT_DIR} (ejecuta scripts/train.py)"
        )
    yield


app = FastAPI(title="FutbolTipster ML Service", version="0.2.0", lifespan=lifespan)


def build_prediction(home: str, away: str, base_model: DixonColes) -> dict:
    base = base_model.predict(home, away)
    mat = base_model.score_matrix(home, away)

    out: dict = {
        "ft": {
            "double_chance": markets.double_chance(base["probabilities"]),
            "over_under": markets.total_markets(mat, FT_LINES),
            "asian_handicap": markets.asian_handicap(mat, AH_LINES),
            "odd_even": markets.odd_even(mat),
            "team_totals": markets.team_totals(mat, TEAM_TOTAL_LINES),
            "clean_sheet": markets.clean_sheet(mat),
            "correct_score_top": markets.correct_score_top(mat),
        },
        "first_goal": markets.first_event(
            base["expected_goals"]["home"], base["expected_goals"]["away"]
        ),
    }

    if models.ht is not None:
        ht_pred = models.ht.predict(home, away)
        ht_mat = models.ht.score_matrix(home, away)
        ht_probs = ht_pred["probabilities"]
        out["ht"] = {
            "probabilities": ht_probs,
            "double_chance": markets.double_chance(ht_probs),
            "over_under": markets.total_markets(ht_mat, HT_LINES),
            "btts_yes": ht_pred["btts_yes"],
            "expected_goals": ht_pred["expected_goals"],
        }
        if models.htft_cond is not None:
            out["ht_ft"] = markets.ht_ft_markets(
                [ht_probs["home"], ht_probs["draw"], ht_probs["away"]], models.htft_cond
            )

    for name, (total_lines, team_lines, handicap_lines) in COUNT_GROUPS.items():
        cm = models.counts.get(name)
        if cm is None:
            continue
        pred = cm.predict(home, away)
        pmf_h = np.asarray(pred["pmf_home"])
        pmf_a = np.asarray(pred["pmf_away"])
        out[name] = {
            "total": markets.total_markets_pmf(pmf_h, pmf_a, total_lines),
            "team_totals": markets.team_totals_pmf(pmf_h, pmf_a, team_lines),
            "most": markets.most_markets(pmf_h, pmf_a),
            "handicap": markets.count_handicap(pmf_h, pmf_a, handicap_lines),
            "expected": pred["expected"],
        }
    if "corners" in out:
        lam_c = out["corners"]["expected"]
        out["first_corner"] = markets.first_event(lam_c["home"], lam_c["away"])

    return {**base, "markets": out}


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "teams": len(models.ft.teams) if models.ft else 0,
        "teams_ec1": len(models.ft_ec1.teams) if models.ft_ec1 else 0,
        "trained_at": models.trained_at,
    }


@app.get("/models")
def models_status() -> dict:
    return {
        "ft": models.ft is not None,
        "ft_ec1": models.ft_ec1 is not None,
        "ht": models.ht is not None,
        "ht_ft_conditional": models.htft_cond is not None,
        "counts": {name: name in models.counts for name in COUNT_GROUPS},
        "trained_at": models.trained_at,
    }


@app.get("/bands")
def bands() -> list[dict[str, float | str]]:
    return confidence_bands()


@app.get("/teams")
def teams(league: str = "global") -> dict:
    ft = select_model(league)
    return {"teams": ft.teams}


@app.post("/predict")
def predict(fixture: Fixture) -> dict:
    ft = select_model(fixture.league)
    for team in (fixture.home, fixture.away):
        if team not in ft.idx:
            raise HTTPException(status_code=404, detail=f"equipo desconocido: {team}")
    return {
        "home": fixture.home,
        "away": fixture.away,
        "league": fixture.league,
        **build_prediction(fixture.home, fixture.away, ft),
    }
