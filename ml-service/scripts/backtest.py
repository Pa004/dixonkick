"""Backtest de rentabilidad de los mercados derivados.

Walk-forward identico a validate.py: entrena con los partidos anteriores a cada
temporada de test y simula apuestas flat de 1 unidad en el pick de mayor
probabilidad de cada mercado.

Cuotas sinteticas estilo SBOBET: a partir de las probs del modelo se aplica un
margen m -> odds = 1 / (p * (1 + m)). Se reporta ROI con margen 0% (edge puro
del modelo, sin impuesto de la casa) y 7% (escenario realista de mercado).

ROI = (suma de retornos netos) / (numero de apuestas). Retorno neto por apuesta:
odds - 1 si el pick acierta, -1 si falla.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.data import BOOKINGS_AWAY, BOOKINGS_HOME, EVENT_COLS, GLOBAL_LEAGUES, load_history
from app.models.count_model import CountModel, rolling_form
from app.models.dixon_coles import DixonColes
from app.models.markets import (
    asian_handicap,
    double_chance,
    most_markets,
    odd_even,
    team_totals_pmf,
    total_markets_pmf,
)

TEST_SEASONS = [2023, 2024, 2025]
MARGINS = [0.0, 0.07]


def test_seasons_from_data(data: pd.DataFrame) -> list[int]:
    """Ultimas 3 temporadas disponibles; dinamico para no quedarse con años fijos."""
    years = sorted(data["Date"].dt.year.unique())
    if len(years) < 4:
        raise SystemExit(f"necesitas al menos 4 temporadas para el walk-forward; hay {len(years)}")
    return years[-3:]


COUNT_COLS: dict[str, tuple[str, str]] = {
    "corners": EVENT_COLS["corners"],
    "bookings": (BOOKINGS_HOME, BOOKINGS_AWAY),
    "shots_on_target": EVENT_COLS["shots_on_target"],
    "fouls": EVENT_COLS["fouls"],
}
# Lineas redondas de mercado para los totales de conteo.
COUNT_LINES: dict[str, float] = {
    "corners": 10.5,
    "bookings": 4.5,
    "shots_on_target": 9.5,
    "fouls": 24.5,
}

BANDS = [
    ("Seguro", 0.65, 1.01),
    ("Probable", 0.55, 0.65),
    ("Ajustado", 0.45, 0.55),
    ("Incierto", 0.0, 0.45),
]

# Cada pick: (mercado, banda, p_del_pick, acierto)
PICKS: list[tuple[str, str, float, bool]] = []


def band_label(p: float) -> str:
    for name, lo, hi in BANDS:
        if lo <= p < hi:
            return name
    return "Incierto"


def pick(market: str, probs: dict[str, float], winners: set[str], band: str) -> None:
    """Registra la apuesta de 1 unidad al outcome de mayor p."""
    best = max(probs, key=probs.get)
    p = probs[best]
    if p <= 0 or not np.isfinite(p):
        return
    PICKS.append((market, band, p, best in winners))


def win_ft(home: float, away: float) -> str:
    if home > away:
        return "H"
    if home < away:
        return "A"
    return "D"


def evaluate_ft(model: DixonColes, test: pd.DataFrame) -> None:
    for row in test.itertuples(index=False):
        pred = model.predict(row.HomeTeam, row.AwayTeam)
        probs = pred["probabilities"]
        # Matriz completa (no la recortada 6x6 del heatmap): los mercados de
        # matriz (par/impar, handicap, total por equipo) necesitan la cola.
        mat = model.score_matrix(row.HomeTeam, row.AwayTeam)
        band = band_label(max(probs.values()))
        ft_win = win_ft(row.FTHG, row.FTAG)
        pick("FT 1X2", {"H": probs["home"], "D": probs["draw"], "A": probs["away"]}, {ft_win}, band)
        dc = double_chance(probs)
        dc_win = {"1X", "12"} if ft_win == "H" else {"1X", "X2"} if ft_win == "D" else {"12", "X2"}
        pick("Doble oportunidad", dc, dc_win, band)
        total_goals = float(row.FTHG + row.FTAG)
        pick(
            "Over/Under 2.5",
            {"over": pred["over_25"], "under": pred["under_25"]},
            {"over"} if total_goals >= 3 else {"under"},
            band,
        )
        oe = odd_even(mat)
        pick("Par/Impar", oe, {"odd"} if total_goals % 2 == 1 else {"even"}, band)
        ah = asian_handicap(mat, [-0.5])["-0.5"]
        pick(
            "Hándicap -0.5",
            {"home": ah["home_cover"], "away": 1.0 - ah["home_cover"]},
            {"home"} if row.FTHG > row.FTAG else {"away"},
            band,
        )
        pt = team_totals_pmf(mat.sum(axis=1), mat.sum(axis=0), [0.5])["0.5"]
        pick(
            "Local anota",
            {"si": pt["home_over"], "no": 1.0 - pt["home_over"]},
            {"si"} if row.FTHG >= 1 else {"no"},
            band,
        )


def evaluate_counts(models: dict[str, CountModel], test: pd.DataFrame, forms: dict) -> None:
    for market, model in models.items():
        hcol, acol = COUNT_COLS[market]
        line = COUNT_LINES[market]
        rows, home_form, away_form = forms[market]
        row_lookup = {
            (r.Date, r.HomeTeam, r.AwayTeam): i for i, r in enumerate(rows.itertuples(index=False))
        }
        for row in test.itertuples(index=False):
            pos = row_lookup.get((row.Date, row.HomeTeam, row.AwayTeam))
            if pos is None:
                continue
            h, a = getattr(row, hcol), getattr(row, acol)
            if pd.isna(h) or pd.isna(a):
                continue
            tot = float(h + a)
            pred = model.predict(
                row.HomeTeam, row.AwayTeam, form_home=home_form[pos], form_away=away_form[pos]
            )
            ou = total_markets_pmf(np.array(pred["pmf_home"]), np.array(pred["pmf_away"]), [line])[
                f"{line:g}"
            ]
            pick(
                f"{market} total",
                {"over": ou["over"], "under": ou["under"]},
                {"over"} if tot > line else {"under"},
                "Incierto",
            )
            most = most_markets(np.array(pred["pmf_home"]), np.array(pred["pmf_away"]))
            pick(
                f"{market} más",
                {"home": most["home"], "away": most["away"], "draw": most["draw"]},
                {"home"} if h > a else {"away"} if h < a else {"draw"},
                "Incierto",
            )


def backtest(df: pd.DataFrame, seasons: list[int]) -> None:
    PICKS.clear()
    for season in seasons:
        train = df[df["Date"].dt.year < season]
        test = df[df["Date"].dt.year == season]
        if len(test) == 0:
            continue
        dc = DixonColes()
        dc.fit(train["Date"], train["HomeTeam"], train["AwayTeam"], train["FTHG"], train["FTAG"])
        evaluate_ft(dc, test)
        counts = {}
        forms = {}
        for name, (hcol, acol) in COUNT_COLS.items():
            rows = df.dropna(subset=[hcol, acol]).sort_values("Date").reset_index(drop=True)
            home_form, away_form, _ = rolling_form(
                rows["Date"], rows["HomeTeam"], rows["AwayTeam"], rows[hcol], rows[acol]
            )
            forms[name] = (rows, home_form, away_form)
            m = CountModel()
            m.fit(
                rows["Date"][rows["Date"].dt.year < season],
                rows["HomeTeam"][rows["Date"].dt.year < season],
                rows["AwayTeam"][rows["Date"].dt.year < season],
                rows[hcol][rows["Date"].dt.year < season],
                rows[acol][rows["Date"].dt.year < season],
            )
            counts[name] = m
        evaluate_counts(counts, test, forms)
        print(f"  season {season}: picks={len(PICKS)}", flush=True)


def report(seasons: list[int]) -> None:
    df = pd.DataFrame(PICKS, columns=["market", "band", "p", "won"])
    for margin in MARGINS:
        net = np.where(df["won"], 1.0 / (df["p"] * (1.0 + margin)) - 1.0, -1.0)
        df[f"net_{margin:.2f}"] = net
    print(f"\n--- Backtest walk-forward {seasons} (apuesta flat de 1u) ---")
    print(
        "  "
        + "mercad"
        + " " * 16
        + "n"
        + " " * 6
        + "hit"
        + " " * 7
        + "p_med"
        + " " * 6
        + "ROI 0%"
        + " " * 6
        + "ROI 7%"
    )
    for market, group in df.groupby("market", sort=False):
        n = len(group)
        hit = group["won"].mean()
        r0 = group[f"net_{MARGINS[0]:.2f}"].sum() / n
        r7 = group[f"net_{MARGINS[1]:.2f}"].sum() / n
        print(f"  {market:20s} {n:6d} {hit:7.3f} {group['p'].mean():7.3f} {r0:+9.2%} {r7:+9.2%}")

    print("\n--- Por banda de confianza (FT 1X2 y Doble oportunidad) ---")
    ft = df[df["market"].isin(["FT 1X2", "Doble oportunidad"])]
    for band, group in ft.groupby("band", sort=False):
        n = len(group)
        r0 = group[f"net_{MARGINS[0]:.2f}"].sum() / n
        r7 = group[f"net_{MARGINS[1]:.2f}"].sum() / n
        print(f"  {band:10s} {n:6d}  ROI 0%: {r0:+9.2%}  ROI 7%: {r7:+9.2%}")


if __name__ == "__main__":
    data = load_history(leagues=GLOBAL_LEAGUES)
    print(
        f"Partidos: {len(data)} | Ligas: {data['League'].nunique()} | Equipos: {data['HomeTeam'].nunique()}"
    )
    seasons = test_seasons_from_data(data)
    backtest(data, seasons)
    report(seasons)
