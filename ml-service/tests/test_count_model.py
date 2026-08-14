"""Tests del modelo Negativo-Binomial de conteos."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from scipy.stats import nbinom

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.count_model import CountModel

TEAMS = ["Alfa", "Beta", "Gamma", "Delta"]
N = 500
RNG = np.random.default_rng(11)


def synthetic_fit():
    """Dataset sintetico con ventaja local y sobredispersion (alpha=0.5)."""
    rng = RNG
    strength = {t: i for i, t in enumerate(TEAMS)}
    alpha = 0.5
    dates, home, away, ch, ca = [], [], [], [], []
    for _ in range(N):
        h = TEAMS[rng.integers(4)]
        a = TEAMS[rng.integers(4)]
        if h == a:
            continue
        mu_h = max(6.0 + 0.6 * (strength[h] - strength[a]) + 0.5, 0.5)
        mu_a = max(5.0 + 0.6 * (strength[a] - strength[h]), 0.5)
        r = 1.0 / alpha
        dates.append(pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(rng.integers(0, 300))))
        home.append(h)
        away.append(a)
        ch.append(nbinom.rvs(r, r / (r + mu_h)))
        ca.append(nbinom.rvs(r, r / (r + mu_a)))
    model = CountModel()
    model.fit(np.array(dates), home, away, ch, ca)
    return model


def test_predict_contract():
    model = synthetic_fit()
    p = model.predict("Alfa", "Beta")
    assert len(p["pmf_home"]) == model.max_count + 1
    assert sum(p["pmf_home"]) == pytest.approx(1.0, abs=1e-6)
    assert sum(p["pmf_away"]) == pytest.approx(1.0, abs=1e-6)
    assert p["expected"]["home"] > 0 and p["expected"]["away"] > 0
    assert 1e-3 <= p["alpha"] <= 5.0


def test_home_advantage_and_sobre_dispersion():
    model = synthetic_fit()
    p = model.predict("Delta", "Alfa")
    assert p["expected"]["home"] > p["expected"]["away"]
    # la sobredispersion recuperada debe ser > un Poisson puro (alpha pequeno)
    assert model.alpha_od > 0.05


def test_save_load_roundtrip(tmp_path):
    model = synthetic_fit()
    path = str(tmp_path / "count.npz")
    model.save(path)
    loaded = CountModel.load(path)
    assert loaded.teams == model.teams
    before = model.predict("Alfa", "Beta")
    after = loaded.predict("Alfa", "Beta")
    assert before["pmf_home"] == pytest.approx(after["pmf_home"])
    assert before["expected"] == pytest.approx(after["expected"])
    assert loaded.alpha_od == pytest.approx(model.alpha_od)
    data = np.load(path, allow_pickle=True)
    assert "saved_at" in data and "n_matches" in data


def test_unknown_team_does_not_crash():
    model = synthetic_fit()
    p = model.predict("Alpha", "Omega")
    assert sum(p["pmf_home"]) == pytest.approx(1.0, abs=1e-6)
