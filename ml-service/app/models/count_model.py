"""Regresion Negativo-Binomial para eventos de conteo (corner, tarjetas, tiros a puerta, faltas).

lambda_home = exp(mu + alpha_home + beta_away + gamma)
lambda_away = exp(mu + alpha_away + beta_home)

mu: intercepto global (nivel base), alpha: ataque, beta: defensa,
gamma: ventaja local. El parametro de sobredispersion alpha_od es global por
mercado (los conteos de futbol son mas dispersos que un Poisson).

Identificabilidad: el equipo de referencia (teams[0]) tiene alpha=beta=0, y mu
absorbe el nivel absoluto. Sin esto, el desplazamiento alpha+c / beta-c deja el
likelihood invariante y el nivel queda mal determinado.
Ajuste por MLE con decaimiento temporal y gradiente analitico.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.special import digamma
from scipy.stats import nbinom

DEFAULT_DECAY = 0.0025
MAX_COUNT = 30  # soporte de las marginales para derivar mercados
ALPHA_MIN = 1e-3
ALPHA_MAX = 5.0


class CountModel:
    def __init__(self, decay: float = DEFAULT_DECAY, max_count: int = MAX_COUNT) -> None:
        self.decay = decay
        self.max_count = max_count
        self.teams: list[str] = []
        self.idx: dict[str, int] = {}
        self.attack: np.ndarray = np.array([])
        self.defense: np.ndarray = np.array([])
        self.mu = 0.0
        self.gamma = 0.0
        self.alpha_od = 0.2
        self.n_matches = 0

    def fit(self, dates, home_team, away_team, home_count, away_count) -> None:
        teams = sorted(set(home_team) | set(away_team))
        self.teams = teams
        self.idx = {t: i for i, t in enumerate(teams)}
        self.n_matches = len(home_team)
        n = len(teams)
        i_home = np.array([self.idx[t] for t in home_team])
        i_away = np.array([self.idx[t] for t in away_team])

        ref = max(dates)
        age_days = np.array([(ref - d).days for d in dates], dtype=float)
        weights = np.exp(-self.decay * age_days)

        free = n - 1  # el equipo de referencia (indice 0) esta fijado a 0
        n_att = free

        def unpack(p):
            mu = p[0]
            attack_free = p[1 : 1 + n_att]
            defense_free = p[1 + n_att : 1 + 2 * n_att]
            gamma = p[1 + 2 * n_att]
            alpha_od = p[2 + 2 * n_att]
            return mu, attack_free, defense_free, gamma, alpha_od

        def nll_and_jac(p):
            mu, attack_free, defense_free, gamma, alpha_od = unpack(p)
            att = np.concatenate([[0.0], attack_free])
            de = np.concatenate([[0.0], defense_free])
            lam_h = np.exp(np.clip(mu + att[i_home] + de[i_away] + gamma, -700, 700))
            lam_a = np.exp(np.clip(mu + att[i_away] + de[i_home], -700, 700))
            r = 1.0 / alpha_od
            like_h = np.clip(nbinom.pmf(home_count, r, r / (r + lam_h)), 1e-12, None)
            like_a = np.clip(nbinom.pmf(away_count, r, r / (r + lam_a)), 1e-12, None)
            nll_val = -np.sum(weights * (np.log(like_h) + np.log(like_a)))

            # d log P(k; mu) / d mu = (k - mu) / (mu * (1 + alpha * mu))
            sh = (home_count - lam_h) / (lam_h * (1.0 + alpha_od * lam_h))
            sa = (away_count - lam_a) / (lam_a * (1.0 + alpha_od * lam_a))
            wh_sh = weights * sh * lam_h
            wh_sa = weights * sa * lam_a

            g_att = -(
                np.bincount(i_home, weights=wh_sh, minlength=n)
                + np.bincount(i_away, weights=wh_sa, minlength=n)
            )
            g_def = -(
                np.bincount(i_away, weights=wh_sh, minlength=n)
                + np.bincount(i_home, weights=wh_sa, minlength=n)
            )
            grad = np.zeros(2 + 2 * n_att + 2)
            grad[0] = -np.sum(wh_sh + wh_sa)
            grad[1 : 1 + n_att] = g_att[1:]
            grad[1 + n_att : 1 + 2 * n_att] = g_def[1:]
            grad[1 + 2 * n_att] = -np.sum(wh_sh)
            # d log P / d alpha (la normalizacion Gamma depende de r=1/alpha)
            dr_da = -1.0 / alpha_od**2
            p_h = r / (r + lam_h)
            p_a = r / (r + lam_a)
            dph = (digamma(home_count + r) - digamma(r) + np.log(p_h)) * dr_da
            dph += (r / p_h - home_count / (1.0 - p_h)) * dr_da * lam_h / (r + lam_h) ** 2
            dpa = (digamma(away_count + r) - digamma(r) + np.log(p_a)) * dr_da
            dpa += (r / p_a - away_count / (1.0 - p_a)) * dr_da * lam_a / (r + lam_a) ** 2
            grad[2 + 2 * n_att] = -np.sum(weights * (dph + dpa))
            return nll_val, grad

        base_rate = 0.5 * (float(np.mean(home_count)) + float(np.mean(away_count)))
        p0 = np.concatenate([[np.log(max(base_rate, 1e-3))], np.zeros(2 * n_att), [0.2], [0.2]])
        bounds = [(None, None)] * (1 + 2 * n_att) + [(None, None), (ALPHA_MIN, ALPHA_MAX)]
        res = minimize(
            nll_and_jac,
            p0,
            jac=True,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": 2000},
        )
        mu, attack_free, defense_free, self.gamma, self.alpha_od = unpack(res.x)
        self.mu = float(mu)
        self.attack = np.concatenate([[0.0], attack_free])
        self.defense = np.concatenate([[0.0], defense_free])

    def predict(self, home: str, away: str) -> dict:
        lam_h = self._lam_home(home, away)
        lam_a = self._lam_away(home, away)
        k = np.arange(self.max_count + 1)
        r = 1.0 / self.alpha_od
        pmf_home = nbinom.pmf(k, r, r / (r + lam_h))
        pmf_away = nbinom.pmf(k, r, r / (r + lam_a))
        pmf_home = pmf_home / pmf_home.sum()
        pmf_away = pmf_away / pmf_away.sum()
        return {
            "pmf_home": pmf_home.tolist(),
            "pmf_away": pmf_away.tolist(),
            "expected": {"home": float(lam_h), "away": float(lam_a)},
            "alpha": float(self.alpha_od),
        }

    def save(self, path: str) -> None:
        np.savez(
            path,
            teams=np.array(self.teams),
            attack=self.attack,
            defense=self.defense,
            mu=np.array([self.mu]),
            gamma=np.array([self.gamma]),
            alpha_od=np.array([self.alpha_od]),
            n_matches=np.array([self.n_matches]),
            saved_at=np.array([np.datetime64("now", "s")]),
        )

    @classmethod
    def load(cls, path: str) -> CountModel:
        data = np.load(path, allow_pickle=True)
        model = cls()
        model.teams = [str(t) for t in data["teams"]]
        model.idx = {t: i for i, t in enumerate(model.teams)}
        model.attack = data["attack"]
        model.defense = data["defense"]
        model.mu = float(data["mu"][0])
        model.gamma = float(data["gamma"][0])
        model.alpha_od = float(data["alpha_od"][0])
        model.n_matches = int(data["n_matches"][0])
        return model

    def _lam_home(self, home: str, away: str) -> float:
        lin = self.mu + self._rate(home, "attack") + self._rate(away, "defense") + self.gamma
        return float(np.exp(np.clip(lin, -700, 700)))

    def _lam_away(self, home: str, away: str) -> float:
        lin = self.mu + self._rate(away, "attack") + self._rate(home, "defense")
        return float(np.exp(np.clip(lin, -700, 700)))

    def _rate(self, team: str, attr: str) -> float:
        i = self.idx.get(team)
        if i is None:
            return 0.0
        return float(getattr(self, attr)[i])
