"""Regresion Negativo-Binomial para eventos de conteo (corner, tarjetas, tiros a puerta, faltas).

lambda_home = exp(mu + alpha_home + beta_away + gamma + bf * forma_home)
lambda_away = exp(mu + alpha_away + beta_home + bf * forma_away)

mu: intercepto global (nivel base), alpha: ataque, beta: defensa,
gamma: ventaja local. El parametro de sobredispersion alpha_od es global por
mercado (los conteos de futbol son mas dispersos que un Poisson).
bf (beta_form) pondera la forma reciente: media movil de los ultimos k partidos
de cada equipo en ese mercado, centrada respecto a la media global del mercado.
Asi un equipo en racha alta levanta su lambda por encima de su ataque historico.

Identificabilidad: el equipo de referencia (teams[0]) tiene alpha=beta=0, y mu
absorbe el nivel absoluto. Sin esto, el desplazamiento alpha+c / beta-c deja el
likelihood invariante y el nivel queda mal determinado.
Ajuste por MLE con decaimiento temporal y gradiente analitico.
"""

from __future__ import annotations

from collections import deque

import numpy as np
from scipy.optimize import minimize
from scipy.special import digamma
from scipy.stats import nbinom

DEFAULT_DECAY = 0.0025
MAX_COUNT = 30  # soporte de las marginales para derivar mercados
ALPHA_MIN = 1e-3
ALPHA_MAX = 5.0
FORM_K = 5  # ventana de la forma reciente (ultimas apariciones por equipo)


def rolling_form(dates, home_team, away_team, home_count, away_count, k: int = FORM_K):
    """Forma reciente centrada por equipo para cada partido.

    Devuelve arrays paralelos (mismo orden que la entrada) con la media movil de
    los ultimos k conteos del equipo ANTES del partido, menos la media global del
    mercado, y un dict con la forma final por equipo. Equipos sin historial
    previo quedan en 0 (la media global centrada).
    """
    dates = np.asarray(dates)
    home_team = np.asarray(home_team)
    away_team = np.asarray(away_team)
    home_count = np.asarray(home_count, dtype=float)
    away_count = np.asarray(away_count, dtype=float)
    order = np.argsort(dates, kind="stable")
    n = len(order)
    home_form = np.zeros(n)
    away_form = np.zeros(n)
    if n == 0:
        return home_form, away_form, {}
    global_mean = 0.5 * (float(np.mean(home_count)) + float(np.mean(away_count)))
    deques: dict[str, deque] = {}
    for pos in order:
        h = home_team[pos]
        a = away_team[pos]
        hq = deques.get(h)
        aq = deques.get(a)
        if hq:
            home_form[pos] = float(np.mean(hq)) - global_mean
        if aq:
            away_form[pos] = float(np.mean(aq)) - global_mean
        deques.setdefault(h, deque(maxlen=k)).append(home_count[pos])
        deques.setdefault(a, deque(maxlen=k)).append(away_count[pos])
    team_form = {t: float(np.mean(q)) - global_mean for t, q in deques.items()}
    return home_form, away_form, team_form


def _nll_grad(
    p: np.ndarray,
    i_home: np.ndarray,
    i_away: np.ndarray,
    home_form: np.ndarray,
    away_form: np.ndarray,
    home_count: np.ndarray,
    away_count: np.ndarray,
    weights: np.ndarray,
    n_teams: int,
) -> tuple[float, np.ndarray]:
    """nll y gradiente analitico del Negativo-Binomial; aislado a nivel de modulo
    para poder testear el gradiente por diferencias finitas."""
    free = n_teams - 1
    mu, attack_free, defense_free = p[0], p[1 : 1 + free], p[1 + free : 1 + 2 * free]
    gamma, beta_form, alpha_od = p[1 + 2 * free], p[2 + 2 * free], p[3 + 2 * free]
    att = np.concatenate([[0.0], attack_free])
    de = np.concatenate([[0.0], defense_free])
    lam_h = np.exp(np.clip(mu + att[i_home] + de[i_away] + gamma + beta_form * home_form, -700, 700))
    lam_a = np.exp(np.clip(mu + att[i_away] + de[i_home] + beta_form * away_form, -700, 700))
    r = 1.0 / alpha_od
    like_h = np.clip(nbinom.pmf(home_count, r, r / (r + lam_h)), 1e-12, None)
    like_a = np.clip(nbinom.pmf(away_count, r, r / (r + lam_a)), 1e-12, None)
    nll = -np.sum(weights * (np.log(like_h) + np.log(like_a)))

    # d log P(k; mu) / d mu = (k - mu) / (mu * (1 + alpha * mu))
    sh = (home_count - lam_h) / (lam_h * (1.0 + alpha_od * lam_h))
    sa = (away_count - lam_a) / (lam_a * (1.0 + alpha_od * lam_a))
    wh_sh = weights * sh * lam_h
    wh_sa = weights * sa * lam_a

    g_att = -(
        np.bincount(i_home, weights=wh_sh, minlength=n_teams)
        + np.bincount(i_away, weights=wh_sa, minlength=n_teams)
    )
    g_def = -(
        np.bincount(i_away, weights=wh_sh, minlength=n_teams)
        + np.bincount(i_home, weights=wh_sa, minlength=n_teams)
    )
    grad = np.zeros(4 + 2 * free)
    grad[0] = -np.sum(wh_sh + wh_sa)
    grad[1 : 1 + free] = g_att[1:]
    grad[1 + free : 1 + 2 * free] = g_def[1:]
    grad[1 + 2 * free] = -np.sum(wh_sh)
    grad[2 + 2 * free] = -np.sum(wh_sh * home_form + wh_sa * away_form)
    # d log P / d alpha (la normalizacion Gamma depende de r=1/alpha)
    dr_da = -1.0 / alpha_od**2
    p_h = r / (r + lam_h)
    p_a = r / (r + lam_a)
    dph = (digamma(home_count + r) - digamma(r) + np.log(p_h)) * dr_da
    dph += (r / p_h - home_count / (1.0 - p_h)) * dr_da * lam_h / (r + lam_h) ** 2
    dpa = (digamma(away_count + r) - digamma(r) + np.log(p_a)) * dr_da
    dpa += (r / p_a - away_count / (1.0 - p_a)) * dr_da * lam_a / (r + lam_a) ** 2
    grad[3 + 2 * free] = -np.sum(weights * (dph + dpa))
    return nll, grad


class CountModel:
    def __init__(
        self, decay: float = DEFAULT_DECAY, max_count: int = MAX_COUNT, form_k: int = FORM_K
    ) -> None:
        self.decay = decay
        self.max_count = max_count
        self.form_k = form_k
        self.teams: list[str] = []
        self.idx: dict[str, int] = {}
        self.attack: np.ndarray = np.array([])
        self.defense: np.ndarray = np.array([])
        self.mu = 0.0
        self.gamma = 0.0
        self.form: np.ndarray = np.array([])
        self.form_beta = 0.0
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

        home_form, away_form, team_form = rolling_form(
            dates, home_team, away_team, home_count, away_count, self.form_k
        )
        self.form = np.array([team_form.get(t, 0.0) for t in teams])

        ref = max(dates)
        age_days = np.array([(ref - d).days for d in dates], dtype=float)
        weights = np.exp(-self.decay * age_days)

        free = n - 1  # el equipo de referencia (indice 0) esta fijado a 0

        def unpack(p):
            mu = p[0]
            attack_free = p[1 : 1 + free]
            defense_free = p[1 + free : 1 + 2 * free]
            gamma = p[1 + 2 * free]
            beta_form = p[2 + 2 * free]
            alpha_od = p[3 + 2 * free]
            return mu, attack_free, defense_free, gamma, beta_form, alpha_od

        base_rate = 0.5 * (float(np.mean(home_count)) + float(np.mean(away_count)))
        p0 = np.concatenate(
            [[np.log(max(base_rate, 1e-3))], np.zeros(2 * free), [0.2], [0.0], [0.2]]
        )
        bounds = [(None, None)] * (1 + 2 * free) + [
            (None, None),
            (None, None),
            (ALPHA_MIN, ALPHA_MAX),
        ]
        res = minimize(
            lambda p: _nll_grad(
                p, i_home, i_away, home_form, away_form, home_count, away_count, weights, n
            ),
            p0,
            jac=True,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": 2000},
        )
        mu, attack_free, defense_free, self.gamma, self.form_beta, self.alpha_od = unpack(res.x)
        self.mu = float(mu)
        self.attack = np.concatenate([[0.0], attack_free])
        self.defense = np.concatenate([[0.0], defense_free])

    def predict(
        self, home: str, away: str, form_home: float | None = None, form_away: float | None = None
    ) -> dict:
        """Predice pmf. Si se dan form_home/form_away usa esos valores de forma
        reciente en vez de los almacenados en el entrenamiento (util en validacion)."""
        lam_h = self._lam(home, away, "home", form_home)
        lam_a = self._lam(home, away, "away", form_away)
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
            form=np.array(self.form),
            form_beta=np.array([self.form_beta]),
            alpha_od=np.array([self.alpha_od]),
            n_matches=np.array([self.n_matches]),
            saved_at=np.array([np.datetime64("now", "s")]),
        )

    @classmethod
    def load(cls, path: str) -> CountModel:
        data = np.load(path)
        model = cls()
        model.teams = [str(t) for t in data["teams"]]
        model.idx = {t: i for i, t in enumerate(model.teams)}
        model.attack = data["attack"]
        model.defense = data["defense"]
        model.mu = float(data["mu"][0])
        model.gamma = float(data["gamma"][0])
        model.alpha_od = float(data["alpha_od"][0])
        model.n_matches = int(data["n_matches"][0])
        if "form" in data and "form_beta" in data:
            model.form = data["form"]
            model.form_beta = float(data["form_beta"][0])
        return model

    def _lam(self, home: str, away: str, side: str, form_override: float | None = None) -> float:
        if side == "home":
            lin = (
                self.mu
                + self._rate(home, "attack")
                + self._rate(away, "defense")
                + self.gamma
                + self.form_beta * self._form(home, form_override)
            )
        else:
            lin = (
                self.mu
                + self._rate(away, "attack")
                + self._rate(home, "defense")
                + self.form_beta * self._form(away, form_override)
            )
        return float(np.exp(np.clip(lin, -700, 700)))

    def _form(self, team: str, override: float | None = None) -> float:
        if override is not None:
            return float(override)
        return self._rate(team, "form")

    def _rate(self, team: str, attr: str) -> float:
        i = self.idx.get(team)
        if i is None:
            return 0.0
        return float(getattr(self, attr)[i])
