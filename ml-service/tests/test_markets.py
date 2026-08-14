"""Tests de las derivaciones puras de mercados."""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models import markets


def score_matrix() -> np.ndarray:
    rng = np.random.default_rng(3)
    m = rng.dirichlet(np.ones(81)).reshape(9, 9)
    return m


def test_double_chance_coherente():
    probs = {"home": 0.5, "draw": 0.3, "away": 0.2}
    dc = markets.double_chance(probs)
    assert dc["1X"] == pytest.approx(0.8)
    assert dc["12"] == pytest.approx(0.7)
    assert dc["X2"] == pytest.approx(0.5)
    assert dc["1X"] + dc["X2"] - dc["12"] == pytest.approx(2 * probs["draw"])


def test_total_markets_over_under_complementan():
    mat = score_matrix()
    tm = markets.total_markets(mat, [0.5, 2.5, 3.5])
    for _line, p in tm.items():
        assert p["over"] + p["under"] == pytest.approx(1.0)
    # over 0.5 es P(hay al menos 1 gol)
    assert tm["0.5"]["over"] == pytest.approx(1.0 - mat[0, 0], abs=1e-9)


def test_asian_handicap_linea_entera_tiene_push():
    mat = score_matrix()
    ah = markets.asian_handicap(mat, [-1.5, 0.0])
    # linea entera: cover + 0.5*push = P(m > -h) en realidad cubre P(m+h>0) + 0.5 P(=0)
    assert 0 <= ah["-1.5"]["home_cover"] <= 1
    assert 0 <= ah["0"]["home_cover"] <= 1
    # -0.5 (local cede medio gol) es mas dificil que 0 (empate con vuelta)
    ah2 = markets.asian_handicap(mat, [-0.5, 0.0])
    assert ah2["-0.5"]["home_cover"] <= ah2["0"]["home_cover"]


def test_odd_even_sum_one():
    oe = markets.odd_even(score_matrix())
    assert oe["odd"] + oe["even"] == pytest.approx(1.0)


def test_team_totals_y_clean_sheet():
    mat = score_matrix()
    tt = markets.team_totals(mat, [1.5, 2.5])
    cs = markets.clean_sheet(mat)
    for _line, p in tt.items():
        assert 0 <= p["home_over"] <= 1
        assert 0 <= p["away_over"] <= 1
    assert 0 <= cs["home"] <= 1 and 0 <= cs["away"] <= 1


def test_correct_score_top():
    top = markets.correct_score_top(score_matrix(), k=8)
    assert len(top) == 8
    probs = [t["prob"] for t in top]
    assert all(0 <= p <= 1 for p in probs)
    assert probs == sorted(probs, reverse=True)
    assert sum(probs) <= 1.0


def test_ht_ft_sum_one():
    ht = [0.4, 0.3, 0.3]
    cond = np.array([[0.6, 0.2, 0.2], [0.3, 0.4, 0.3], [0.2, 0.2, 0.6]])
    cells = markets.ht_ft_markets(ht, cond)
    assert len(cells) == 9
    assert sum(c["prob"] for c in cells) == pytest.approx(1.0, abs=1e-9)
    assert {c["ht"] for c in cells} == {"H", "D", "A"}


def test_count_markets():
    pmf_h = np.zeros(21)
    pmf_a = np.zeros(21)
    pmf_h[5], pmf_a[3] = 1.0, 1.0
    tm = markets.total_markets_pmf(pmf_h, pmf_a, [7.5, 8.5])
    assert tm["7.5"]["over"] == pytest.approx(1.0)
    assert tm["8.5"]["over"] == pytest.approx(0.0)
    most = markets.most_markets(pmf_h, pmf_a)
    assert most == {"home": 1.0, "draw": 0.0, "away": 0.0}
    hc = markets.count_handicap(pmf_h, pmf_a, [-1.5, 0.0])
    assert hc["-1.5"]["home_cover"] == pytest.approx(1.0)
    tt = markets.team_totals_pmf(pmf_h, pmf_a, [4.5])
    assert tt["4.5"]["home_over"] == pytest.approx(1.0)
    assert tt["4.5"]["away_over"] == pytest.approx(0.0)


def test_first_event():
    fe = markets.first_event(2.0, 1.0)
    assert fe["home"] + fe["away"] + fe["none"] == pytest.approx(1.0)
    assert fe["home"] > fe["away"]
    assert fe["none"] == pytest.approx(np.exp(-3.0))
    assert markets.first_event(0.0, 0.0) == {"home": 0.0, "away": 0.0, "none": 1.0}
