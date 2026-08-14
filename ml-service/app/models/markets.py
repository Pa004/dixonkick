"""Derivaciones de mercados a partir de matrices de marcador y marginales de conteo.

Todas las funciones son puras: reciben matrices/probabilidades y devuelven
probabilidades de mercado sin estado. El asentamiento de handicap sigue la
regla asiatica: en lineas enteras, margen == 0 es push y reparte la mitad.

Aproximaciones documentadas:
- "primer gol / primer corner" asume procesos de Poisson independientes y
  homogeneos: P(equipo anota primero) = lam / (lam_local + lam_visita).
- "mas corners" usa independencia entre las marginales (sin correccion).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

RESULT_LABELS = ["H", "D", "A"]


def _over_from_marginal(marg: np.ndarray, line: float) -> float:
    idx = np.arange(marg.size)
    if line == int(line):
        return float(marg[idx > line].sum()) + 0.5 * float(marg[idx == line].sum())
    return float(marg[idx > line].sum())


def double_chance(probs: dict[str, float]) -> dict[str, float]:
    home, draw, away = probs["home"], probs["draw"], probs["away"]
    return {"1X": home + draw, "12": home + away, "X2": draw + away}


def total_markets(mat: np.ndarray, lines: list[float]) -> dict[str, dict[str, float]]:
    g = np.arange(mat.shape[0])
    total = g[:, None] + g[None, :]
    out: dict[str, dict[str, float]] = {}
    for line in lines:
        over = float(mat[total >= line].sum())
        out[f"{line:g}"] = {"over": over, "under": 1.0 - over}
    return out


def asian_handicap(mat: np.ndarray, lines: list[float]) -> dict[str, dict[str, float]]:
    g = np.arange(mat.shape[0])
    margin = g[:, None] - g[None, :]
    out: dict[str, dict[str, float]] = {}
    for h in lines:
        m = margin + h
        if h == int(h):
            cover = float(mat[m > 0].sum()) + 0.5 * float(mat[m == 0].sum())
        else:
            cover = float(mat[m > 0].sum())
        out[f"{h:g}"] = {"home_cover": cover}
    return out


def odd_even(mat: np.ndarray) -> dict[str, float]:
    g = np.arange(mat.shape[0])
    total = g[:, None] + g[None, :]
    odd = float(mat[total % 2 == 1].sum())
    return {"odd": odd, "even": 1.0 - odd}


def team_totals(mat: np.ndarray, lines: list[float]) -> dict[str, dict[str, float]]:
    home_marg = mat.sum(axis=1)
    away_marg = mat.sum(axis=0)
    out: dict[str, dict[str, float]] = {}
    for line in lines:
        out[f"{line:g}"] = {
            "home_over": _over_from_marginal(home_marg, line),
            "away_over": _over_from_marginal(away_marg, line),
        }
    return out


def clean_sheet(mat: np.ndarray) -> dict[str, float]:
    away_marg = mat.sum(axis=0)  # P(goles visita = k)
    home_marg = mat.sum(axis=1)  # P(goles local = k)
    return {"home": float(away_marg[0]), "away": float(home_marg[0])}


def correct_score_top(mat: np.ndarray, k: int = 8) -> list[dict[str, Any]]:
    order = np.argsort(mat, axis=None)[::-1][:k]
    rows, cols = np.unravel_index(order, mat.shape)
    return [
        {"home": int(r), "away": int(c), "prob": float(mat[r, c])}
        for r, c in zip(rows, cols, strict=True)
    ]


def ht_ft_markets(ht_probs: list[float], cond: np.ndarray) -> list[dict[str, Any]]:
    """P(HT=i, FT=j) = P_ht(i) * P(FT=j | HT=i); cond es 3x3 filas=HT, cols=FT."""
    joint = np.outer(np.array(ht_probs), np.ones(3)) * cond
    joint = joint / joint.sum()
    return [
        {"ht": RESULT_LABELS[i], "ft": RESULT_LABELS[j], "prob": float(joint[i, j])}
        for i in range(3)
        for j in range(3)
    ]


def total_markets_pmf(
    pmf_home: np.ndarray, pmf_away: np.ndarray, lines: list[float]
) -> dict[str, dict[str, float]]:
    total = np.convolve(pmf_home, pmf_away)
    g = np.arange(total.size)
    out: dict[str, dict[str, float]] = {}
    for line in lines:
        over = float(total[g >= line].sum())
        out[f"{line:g}"] = {"over": over, "under": 1.0 - over}
    return out


def team_totals_pmf(
    pmf_home: np.ndarray, pmf_away: np.ndarray, lines: list[float]
) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for line in lines:
        out[f"{line:g}"] = {
            "home_over": _over_from_marginal(pmf_home, line),
            "away_over": _over_from_marginal(pmf_away, line),
        }
    return out


def most_markets(pmf_home: np.ndarray, pmf_away: np.ndarray) -> dict[str, float]:
    p_home = p_draw = p_away = 0.0
    for i, ph in enumerate(pmf_home):
        for j, pa in enumerate(pmf_away):
            if i > j:
                p_home += ph * pa
            elif i < j:
                p_away += ph * pa
            else:
                p_draw += ph * pa
    return {"home": p_home, "draw": p_draw, "away": p_away}


def count_handicap(
    pmf_home: np.ndarray, pmf_away: np.ndarray, lines: list[float]
) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for h in lines:
        cover = 0.0
        for i, ph in enumerate(pmf_home):
            for j, pa in enumerate(pmf_away):
                m = (i - j) + h
                if m > 0:
                    cover += ph * pa
                elif m == 0 and h == int(h):
                    cover += 0.5 * ph * pa
        out[f"{h:g}"] = {"home_cover": cover}
    return out


def first_event(lam_home: float, lam_away: float) -> dict[str, float]:
    total = lam_home + lam_away
    if total <= 1e-9:
        return {"home": 0.0, "away": 0.0, "none": 1.0}
    p_some = 1.0 - math.exp(-total)
    return {
        "home": lam_home / total * p_some,
        "away": lam_away / total * p_some,
        "none": math.exp(-total),
    }
