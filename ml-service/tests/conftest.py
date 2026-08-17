"""Artefactos sinteticos para los tests de la API.

data/ y artifacts/ estan gitignored (regenerables con scripts/train.py), asi que
los tests no pueden depender de los modelos entrenados reales. Este fixture
entrena modelos pequenos y deterministicos en un tmp dir y redirige ARTIFACT_DIR
hacia ahi; solo se construye cuando los tests de la API lo piden.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

GLOBAL_TEAMS = [f"Global{i}" for i in range(1, 7)]
EC1_TEAMS = [f"Ecuador{i}" for i in range(1, 5)]


def _synthetic_matches(teams: list[str], n: int, seed: int):
    rng = np.random.default_rng(seed)
    strength = {t: i for i, t in enumerate(teams)}
    dates: list[pd.Timestamp] = []
    home: list[str] = []
    away: list[str] = []
    gh: list[int] = []
    ga: list[int] = []
    for _ in range(n):
        h = teams[rng.integers(len(teams))]
        a = teams[rng.integers(len(teams))]
        if h == a:
            continue
        lam_h = max(1.5 + 0.4 * (strength[h] - strength[a]) + 0.3, 0.1)
        lam_a = max(1.2 + 0.4 * (strength[a] - strength[h]), 0.1)
        dates.append(pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(rng.integers(0, 300))))
        home.append(h)
        away.append(a)
        gh.append(int(rng.poisson(lam_h)))
        ga.append(int(rng.poisson(lam_a)))
    return dates, home, away, gh, ga


@pytest.fixture(scope="session")
def synthetic_artifacts(tmp_path_factory):
    import app.api as api
    from app.models.count_model import CountModel
    from app.models.dixon_coles import DixonColes

    art = tmp_path_factory.mktemp("artifacts")

    dates, home, away, gh, ga = _synthetic_matches(GLOBAL_TEAMS, 200, seed=1)
    ft = DixonColes()
    ft.fit(np.array(dates), home, away, gh, ga)
    ft.save(art / "dixon_coles.npz")

    dates_ec, home_ec, away_ec, gh_ec, ga_ec = _synthetic_matches(EC1_TEAMS, 120, seed=2)
    ec1 = DixonColes()
    ec1.fit(np.array(dates_ec), home_ec, away_ec, gh_ec, ga_ec)
    ec1.save(art / "dixon_coles_ec1.npz")

    ht = DixonColes()
    ht.fit(np.array(dates), home, away, [g // 2 for g in gh], [g // 2 for g in ga])
    ht.save(art / "dixon_coles_ht.npz")

    np.savez(
        art / "htft_cond.npz",
        cond=np.full((3, 3), 1.0 / 3.0),
        saved_at=np.array([np.datetime64("now", "s")]),
    )

    counts = [max(int(3 + 0.4 * gh[i] - 0.2 * ga[i]), 0) for i in range(len(gh))]
    counts_a = [max(int(3 + 0.4 * ga[i] - 0.2 * gh[i]), 0) for i in range(len(gh))]
    for name in api.COUNT_GROUPS:
        cm = CountModel()
        cm.fit(np.array(dates), home, away, counts, counts_a)
        cm.save(art / f"{name}.npz")

    api.ARTIFACT_DIR = art
    return art
