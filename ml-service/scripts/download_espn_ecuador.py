"""Descarga el historico de la Liga Pro ecuatoriana (ecu.1) desde ESPN.

El scoreboard de ESPN cubre temporadas completas atras, pero no expone stats
de conteo (corners, tiros, tarjetas); solo marcadores. Genera por temporada un
CSV `EC1{year}.csv` con las columnas minimas que consume el modelo FT:

    Div, Date, HomeTeam, AwayTeam, FTHG, FTAG

Sin proxy: el endpoint publico de ESPN responde directo (a diferencia de
football-data.co.uk, que requiere r.jina.ai).
"""

from __future__ import annotations

import csv
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/ecu.1/scoreboard"
# ESPN bloquea UAs de navegador completos pero sirve a "Mozilla/5.0 (research)"
HEADERS = {"User-Agent": "Mozilla/5.0 (research)"}
FIRST_YEAR = 2014
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

OUT_COLS = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]


def month_range(year: int, month: int) -> str:
    """'YYYYMMDD' del primer y ultimo dia del mes."""
    first = date(year, month, 1)
    last = (date(year + month // 12, month % 12 + 1, 1) - timedelta(days=1))
    fmt = "%Y%m%d"
    return f"{first.strftime(fmt)}-{last.strftime(fmt)}"


def fetch(url: str, retries: int = 3) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except Exception as exc:
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"descarga fallida tras {retries} intentos: {last}")


def parse_month(raw: bytes) -> list[dict]:
    """Convierte un mes del scoreboard en filas (home, away, goles)."""
    import json

    payload = json.loads(raw)
    rows = []
    for ev in payload.get("events", []):
        comp = (ev.get("competitions") or [{}])[0]
        competitors = comp.get("competitors", [])
        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home or not away:
            continue
        state = (ev.get("status") or {}).get("type", {}).get("state", "pre")
        if state != "post":
            continue
        home_score = home.get("score") or ""
        away_score = away.get("score") or ""
        if home_score == "" or away_score == "":
            continue
        # ESPN usa displayName (p. ej. "Barcelona SC"); es la misma fuente que el
        # sync de fixtures, asi que los nombres coinciden 1:1 con el modelo.
        rows.append(
            {
                "Date": _to_dmy(ev["date"]),
                "HomeTeam": home["team"]["displayName"],
                "AwayTeam": away["team"]["displayName"],
                "FTHG": int(float(home_score)),
                "FTAG": int(float(away_score)),
            }
        )
    return rows


def _to_dmy(iso: str) -> str:
    return date.fromisoformat(iso[:10]).strftime("%d/%m/%Y")


def season_label(year: int) -> str:
    return f"{year % 100}{((year + 1) % 100):02d}"


def validate_rows(rows: list[dict], year: int) -> None:
    if len(rows) < 20:
        raise ValueError(f"temporada {year}: solo {len(rows)} partidos post; parece incompleta")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    current_year = date.today().year
    ok, fail = 0, 0
    for year in range(FIRST_YEAR, current_year + 1):
        out = DATA_DIR / f"EC1{year}.csv"
        if out.exists():
            ok += 1
            print(f"SKIP {year}")
            continue
        rows: list[dict] = []
        try:
            for month in range(1, 13):
                url = f"{BASE_URL}?{urllib.parse.urlencode({'dates': month_range(year, month)})}"
                rows.extend(parse_month(fetch(url)))
                time.sleep(0.2)
            validate_rows(rows, year)
            with out.open("w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=OUT_COLS)
                writer.writeheader()
                writer.writerows(rows)
            ok += 1
            print(f"OK   {year} ({len(rows)} partidos)")
        except Exception as exc:
            fail += 1
            print(f"FAIL {year}: {exc}")
            if out.exists():
                out.unlink()
    print(f"\ndescargados: {ok}, fallidos: {fail}")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()