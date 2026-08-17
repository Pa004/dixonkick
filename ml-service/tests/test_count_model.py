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
    data = np.load(path)
    assert "saved_at" in data and "n_matches" in data
    # El array de equipos es unicode, no objeto: sin pickle (allow_pickle=False)
    assert data["teams"].dtype.kind == "U"


def test_unknown_team_does_not_crash():
    model = synthetic_fit()
    p = model.predict("Alpha", "Omega")
    assert sum(p["pmf_home"]) == pytest.approx(1.0, abs=1e-6)


def test_gradiente_coincide_con_diferencias_finitas():
    """El gradiente analitico de _nll_grad debe cuadrar con el numerico."""
    from app.models.count_model import _nll_grad

    rng = np.random.default_rng(3)
    teams = ["Alfa", "Beta", "Gamma", "Delta"]
    dates, home, away, ch, ca = [], [], [], [], []
    for _ in range(60):
        h = teams[rng.integers(4)]
        a = teams[rng.integers(4)]
        if h == a:
            continue
        dates.append(pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(rng.integers(0, 100))))
        home.append(h)
        away.append(a)
        ch.append(int(rng.poisson(6)))
        ca.append(int(rng.poisson(5)))

    idx = {t: i for i, t in enumerate(teams)}
    i_home = np.array([idx[t] for t in home])
    i_away = np.array([idx[t] for t in away])
    # Forma reciente determinista (sin mirar el futuro): media global centrada 0
    n = len(home)
    home_form = np.zeros(n)
    away_form = np.zeros(n)
    weights = np.ones(n)
    free = len(teams) - 1
    p = np.concatenate([[np.log(1.5)], np.zeros(2 * free), [0.2], [0.0], [0.3]])

    nll, grad = _nll_grad(p, i_home, i_away, home_form, away_form, ch, ca, weights, len(teams))
    assert np.isfinite(nll)

    eps = 1e-6
    numeric = np.zeros_like(p)
    for i in range(len(p)):
        dp = np.zeros_like(p)
        dp[i] = eps
        f_hi, _ = _nll_grad(p + dp, i_home, i_away, home_form, away_form, ch, ca, weights, len(teams))
        f_lo, _ = _nll_grad(p - dp, i_home, i_away, home_form, away_form, ch, ca, weights, len(teams))
        numeric[i] = (f_hi - f_lo) / (2 * eps)

    rel_err = np.abs(grad - numeric) / (np.abs(numeric) + 1e-9)
    assert rel_err.max() < 1e-4
