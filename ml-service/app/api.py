"""Servicio FastAPI: predicciones Dixon-Coles."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.models.dixon_coles import DixonColes

MODEL_PATH = Path(__file__).resolve().parent.parent / "artifacts" / "dixon_coles.npz"

model: DixonColes | None = None


class Fixture(BaseModel):
    home: str
    away: str


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global model
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Modelo no encontrado: {MODEL_PATH} (ejecuta scripts/train.py)")
    model = DixonColes.load(MODEL_PATH)
    yield


app = FastAPI(title="FutbolTipster ML Service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "teams": len(model.teams) if model else 0}


@app.get("/teams")
def teams() -> dict:
    return {"teams": model.teams if model else []}


@app.post("/predict")
def predict(fixture: Fixture) -> dict:
    if model is None:
        raise HTTPException(status_code=503, detail="modelo no cargado")
    for team in (fixture.home, fixture.away):
        if team not in model.idx:
            raise HTTPException(status_code=404, detail=f"equipo desconocido: {team}")
    return {"home": fixture.home, "away": fixture.away, **model.predict(fixture.home, fixture.away)}
