"""Modelo Dixon-Coles (1997): Poisson bivariado con correccion tau.

lambda_home = exp(alpha_home + beta_away + gamma)
lambda_away = exp(alpha_away + beta_home)

alpha: ataque, beta: defensa, gamma: ventaja local,
rho: correccion de marcadores bajos (tau).
Ajuste por maxima verosimilitud con decaimiento temporal.
"""

from __future__ import annotations

import json

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

DEFAULT_DECAY = 0.0025
MAX_GOALS = 8


class DixonColes:
    def __init__(self, decay: float = DEFAULT_DECAY, max_goals: int = MAX_GOALS) -> None:
        self.decay = decay
        self.max_goals = max_goals
        self.teams: list[str] = []
        self.idx: dict[str, int] = {}
        self.attack: np.ndarray = np.array([])
        self.defense: np.ndarray = np.array([])
        self.gamma = 0.0
        self.rho = 0.0

    def fit(self, dates, home_team, away_team, home_goals, away_goals) -> None:
        teams = sorted(set(home_team) | set(away_team))
        self.teams = teams
        self.idx = {t: i for i, t in enumerate(teams)}
        n = len(teams)
        i_home = np.array([self.idx[t] for t in home_team])
        i_away = np.array([self.idx[t] for t in away_team])

        ref = max(dates)
        age_days = np.array([(ref - d).days for d in dates], dtype=float)
        weights = np.exp(-self.decay * age_days)

        def unpack(p):
            attack = p[:n]
            defense = p[n:2 * n]
            gamma = p[2 * n]
            rho = p[2 * n + 1]
            return attack, defense, gamma, rho

        def nll(p) -> float:
            attack, defense, gamma, rho = unpack(p)
            lam_h = np.exp(attack[i_home] + defense[i_away] + gamma)
            lam_a = np.exp(attack[i_away] + defense[i_home])
            tau = self._tau(rho, lam_h, lam_a, home_goals, away_goals)
            like = (
                poisson.pmf(home_goals, lam_h)
                * poisson.pmf(away_goals, lam_a)
                * tau
            )
            like = np.clip(like, 1e-12, None)
            return -float(np.sum(weights * np.log(like)))

        # Centrado de ataques para identificabilidad (penalizacion suave)
        def nll_pen(p) -> float:
            attack, defense, _, _ = unpack(p)
            return nll(p) + 1e-6 * (attack.sum() ** 2 + defense.sum() ** 2)

        p0 = np.concatenate([
            np.zeros(n),
            np.zeros(n),
            [0.2],
            [0.0],
        ])
        res = minimize(
            nll_pen,
            p0,
            method="L-BFGS-B",
            options={"maxiter": 2000},
        )
        attack, defense, self.gamma, self.rho = unpack(res.x)
        attack = attack - attack.mean()
        defense = defense - defense.mean()
        self.attack, self.defense = attack, defense

    def _tau(self, rho, lam_h, lam_a, x, y) -> np.ndarray:
        out = np.ones_like(x, dtype=float)
        zero = (x == 0) & (y == 0)
        one = (x == 0) & (y == 1)
        two = (x == 1) & (y == 0)
        three = (x == 1) & (y == 1)
        out[zero] = 1 - lam_h[zero] * lam_a[zero] * rho
        out[one] = 1 + lam_h[one] * rho
        out[two] = 1 + lam_a[two] * rho
        out[three] = 1 - rho
        return np.clip(out, 1e-6, None)

    def score_matrix(self, home: str, away: str) -> np.ndarray:
        lam_h = self._lam_home(home, away)
        lam_a = self._lam_away(home, away)
        max_g = self.max_goals
        grid_x, grid_y = np.meshgrid(np.arange(max_g + 1), np.arange(max_g + 1), indexing="ij")
        x = grid_x.ravel()
        y = grid_y.ravel()
        tau = self._tau(self.rho, np.full_like(x, lam_h), np.full_like(x, lam_a), x, y)
        probs = (
            poisson.pmf(x, lam_h) * poisson.pmf(y, lam_a) * tau
        ).reshape(max_g + 1, max_g + 1)
        return probs / probs.sum()

    def save(self, path: str) -> None:
        np.savez(
            path,
            teams=np.array(self.teams),
            attack=self.attack,
            defense=self.defense,
            gamma=np.array([self.gamma]),
            rho=np.array([self.rho]),
        )

    @classmethod
    def load(cls, path: str) -> "DixonColes":
        data = np.load(path, allow_pickle=True)
        model = cls()
        model.teams = [str(t) for t in data["teams"]]
        model.idx = {t: i for i, t in enumerate(model.teams)}
        model.attack = data["attack"]
        model.defense = data["defense"]
        model.gamma = float(data["gamma"][0])
        model.rho = float(data["rho"][0])
        return model

    def _lam_home(self, home: str, away: str) -> float:
        return float(np.exp(self._rate(home, "attack") + self._rate(away, "defense") + self.gamma))

    def _lam_away(self, home: str, away: str) -> float:
        return float(np.exp(self._rate(away, "attack") + self._rate(home, "defense")))

    def _rate(self, team: str, attr: str) -> float:
        i = self.idx.get(team)
        if i is None:
            return 0.0
        return float(getattr(self, attr)[i])

    def predict(self, home: str, away: str) -> dict:
        mat = self.score_matrix(home, away)
        p_home = float(mat[np.tril_indices_from(mat, -1)].sum())
        p_away = float(mat[np.triu_indices_from(mat, 1)].sum())
        p_draw = float(np.trace(mat))
        home_idx, away_idx = np.where(mat == mat.max())
        scoreline = (int(home_idx[0]), int(away_idx[0]))
        goals = np.arange(mat.shape[0])
        mask_over25 = (goals[:, None] + goals[None, :]) >= 3
        p_over25 = float(mat[mask_over25].sum())
        p_btts = float(mat[1:, 1:].sum())
        most_likely = max([p_home, p_draw, p_away])
        if most_likely == p_home:
            pick = "H"
        elif most_likely == p_draw:
            pick = "D"
        else:
            pick = "A"
        return {
            "probabilities": {"home": p_home, "draw": p_draw, "away": p_away},
            "scoreline": {"home": scoreline[0], "away": scoreline[1], "probability": float(mat.max())},
            "over_25": p_over25,
            "under_25": 1 - p_over25,
            "btts_yes": p_btts,
            "btts_no": 1 - p_btts,
            "expected_goals": {"home": self._lam_home(home, away), "away": self._lam_away(home, away)},
            "pick": pick,
            "confidence": confidence_label(most_likely),
            "score_matrix": mat.tolist(),
        }


def confidence_label(p: float) -> dict:
    if p >= 0.65:
        level, label = "seguro", "Seguro"
    elif p >= 0.55:
        level, label = "probable", "Probable"
    elif p >= 0.45:
        level, label = "ajustado", "Ajustado"
    else:
        level, label = "incierto", "Incierto"
    return {"level": level, "label": label, "probability": round(p, 3)}