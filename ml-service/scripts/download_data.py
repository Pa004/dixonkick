"""Descarga historicos de football-data.co.uk via proxy r.jina.ai.

El sitio esta bloqueado desde la red local; r.jina.ai sirve el CSV
envuelto en cabeceras de metadatos que se eliminan antes de guardar.
"""

import csv
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/{league}.csv"
PROXY = "https://r.jina.ai/"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

LEAGUES = {"E0": "england", "SP1": "spain", "I1": "italy", "D1": "germany", "F1": "france"}
SEASONS = list(range(2014, 2026))


def season_folder(year: int) -> str:
    return f"{year % 100}{((year + 1) % 100):02d}"


def fetch(url: str, retries: int = 3) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research)"})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as exc:
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"descarga fallida tras {retries} intentos: {last}")


def strip_jina_wrapper(text: str) -> str:
    marker = "Markdown Content:"
    idx = text.find(marker)
    if idx == -1:
        return text.strip()
    return text[idx + len(marker):].strip()


def validate_rows(text: str, league: str) -> None:
    rows = [r for r in text.splitlines() if r.strip()]
    if len(rows) < 10:
        raise ValueError(f"archivo sin datos suficientes ({len(rows)} filas)")
    header = rows[0].split(",")
    ncols = len(header)
    for row in rows[1:]:
        if len(row.split(",")) != ncols:
            raise ValueError(
                f"fila con {len(row.split(','))} columnas != {ncols}: {row[:80]}"
            )
    if "HomeTeam" not in header or "FTHG" not in header:
        raise ValueError(f"columnas esperadas ausentes: {header[:10]}")
    if "..." in text[-20:]:
        raise ValueError("respuesta truncada por el proxy")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ok, fail = 0, 0
    for league in LEAGUES:
        for year in SEASONS:
            folder = season_folder(year)
            out = DATA_DIR / f"{league}{year}.csv"
            if out.exists():
                ok += 1
                print(f"SKIP {league} {year}")
                continue
            url = PROXY + BASE_URL.format(season=folder, league=league)
            try:
                raw = fetch(url)
                cleaned = strip_jina_wrapper(raw)
                validate_rows(cleaned, league)
                out.write_text(cleaned, encoding="utf-8")
                ok += 1
                print(f"OK   {league} {year} ({len(cleaned.splitlines())} filas)")
            except Exception as exc:
                fail += 1
                print(f"FAIL {league} {year}: {exc}")
            time.sleep(0.4)
    print(f"\ndescargados: {ok}, fallidos: {fail}")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
