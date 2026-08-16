# FutbolTipster

Predicciones 1X2 y mercados derivados de fútbol con modelos estadísticos (Dixon-Coles y Negativo-Binomial). Sin apuestas: muestra probabilidades y bandas de confianza como referencia.

## Arquitectura

Monorepo de tres servicios:

| Servicio | Tecnología | Puerto | Responsabilidad |
|----------|------------|--------|-----------------|
| `ml-service` | Python / FastAPI | 8001 | Modelos estadísticos y mercados (`/predict`, `/teams`, `/health`, `/models`) |
| `server` | Node / Express + SQLite | 4000 | Orquesta ESPN, resuelve equipos, pide predicciones, persiste y hace tracking (`/api/*`) |
| `web` | React 19 / Vite / Tailwind v4 | 5173 | SPA que solo lee `/api` |

Flujo: el server consume la API de ESPN, resuelve los nombres de equipos contra el modelo (`server/src/teams.ts`), pide la predicción al ml-service y persiste fixtures/picks en SQLite (`server/data/futbol.db`). El web consume `/api` (en dev vía proxy de Vite).

## Modelos

Todos se entrenan sobre históricos de football-data.co.uk (5 ligas europeas, 2014-2025) con decaimiento temporal (partidos recientes pesan más).

- **Dixon-Coles FT** (`app/models/dixon_coles.py`): Poisson bivariado con corrección tau para marcadores bajos. Estima ataque, defensa, ventaja local y rho por MLE. Genera la matriz de marcadores 9x9 (la UI dibuja 6x6).
- **Dixon-Coles HT**: mismo modelo para el marcador de la primera mitad.
- **Condicional empírica HT/FT** (`app/models/markets.py: ht_ft_markets`): P(FT | HT) 3x3 ponderada por decaimiento, combinada con las marginales de HT.
- **Negativo-Binomial por conteo** (`app/models/count_model.py`): un modelo por mercado de conteo — corners, bookings, tiros a puerta y faltas — con sobredispersión global y **forma reciente** (media móvil de los últimos 5 partidos de cada equipo, centrada respecto a la media del mercado). Bookings sigue la regla SBOBET (amarilla=1, roja=2).

Todos los modelos guardan artefactos en `ml-service/artifacts/` (`*.npz`) que el ml-service carga al arrancar.

## Mercados

El endpoint `/predict` devuelve, además del 1X2 base (probabilidades, marcador más probable, over/under 2.5, BTTS, goles esperados, pick y banda de confianza):

- **FT**: doble oportunidad, over/under (0.5-4.5), hándicap asiático (-1.5 a +1.5), par/impar, totales por equipo (0.5-2.5), clean sheet, top de marcadores exactos.
- **Primera mitad**: probabilidades 1X2, doble oportunidad, over/under 0.5 y 1.5, BTTS y HT/FT (9 combinaciones).
- **Conteos** (corners, bookings, tiros, faltas): total por línea, total por equipo, más (home/draw/away) y hándicap.
- **Primer gol / primer córner**: por Poisson independiente homogéneo.

Aproximaciones documentadas en `app/models/markets.py`: primer evento asume procesos de Poisson independientes y "más X" usa independencia entre marginales.

## Datos y entrenamiento

El flujo completo es: descargar → entrenar → validar → backtest.

```bash
cd ml-service
pip install -r requirements.txt

# 1) Descargar históricos (football-data.co.uk vía proxy; bloqueado en la red local)
python scripts/download_data.py        # genera CSVs en ml-service/data/ (2014-2025, 5 ligas)

# 2) Entrenar todos los modelos
python scripts/train.py                # genera artifacts/: dixon_coles, dixon_coles_ht,
                                       #   htft_cond y corners/bookings/shots_on_target/fouls

# 3) Validar con walk-forward (log-loss, RPS, accuracy, calibración por banda, skill)
python scripts/validate.py

# 4) Backtest de rentabilidad de los mercados
python scripts/backtest.py
```

Liga Pro (EC1): se descarga el histórico de ESPN y se entrena un Dixon-Coles por liga (el global queda intacto):

```bash
python scripts/download_espn_ecuador.py   # genera data/EC1{year}.csv (2014-hoy)
python scripts/train.py --league EC1     # genera artifacts/dixon_coles_ec1.npz
```

Nota: `ml-service/data/` y `ml-service/artifacts/` están en `.gitignore`; se regeneran con los comandos anteriores.

## Validación

Walk-forward: para cada temporada de test (2023-2025) se entrena solo con los partidos anteriores y se evalúa out-of-sample (n≈5373).

**Dixon-Coles FT:**

| Temporada | Log-loss | RPS | Accuracy |
|-----------|----------|-----|----------|
| 2023 | 1.002 | 0.206 | 51.2% |
| 2024 | 0.985 | 0.198 | 52.7% |
| 2025 | 0.993 | 0.206 | 51.8% |

**Modelos de conteo (skill vs baseline empírico):**

| Mercado | Skill |
|---------|-------|
| faltas | +2.6% |
| tiros a puerta | +0.4% |
| corners | -0.2% |
| bookings | -1.2% |

Un ensamble con XGBoost se probó y se descartó por no superar el umbral de mejora. La forma reciente se mantuvo por mejorar ligeramente faltas y no regresar el resto (su peso aprendido es casi nulo).

## Backtest de rentabilidad

Simula apuestas flat de 1 unidad en el pick de mayor probabilidad de cada mercado, con cuotas sintéticas estilo SBOBET (`odds = 1 / (p * (1 + margen))`). Reporta ROI con margen 0% (edge puro del modelo) y 7% (escenario realista de mercado). Walk-forward idéntico a la validación, n≈5372.

| Mercado | hit | ROI 0% | ROI 7% |
|---------|-----|--------|--------|
| FT 1X2 | 0.519 | -1.79% | -8.22% |
| Doble oportunidad | 0.777 | -1.61% | -8.05% |
| Over/Under 2.5 | 0.570 | -4.02% | -10.30% |
| Par/Impar | 0.513 | -1.12% | -7.59% |
| Hándicap -0.5 | 0.651 | -0.13% | -6.66% |
| **Local anota** | 0.772 | **+3.65%** | -3.13% |
| corners total | 0.608 | -4.04% | -10.31% |
| corners más | 0.585 | -4.67% | -10.91% |
| bookings total | 0.570 | -7.92% | -13.94% |
| bookings más | 0.456 | -8.03% | -14.05% |
| tiros total | 0.617 | -4.39% | -10.64% |
| tiros más | 0.620 | -2.04% | -8.45% |
| faltas total | 0.614 | -6.55% | -12.66% |
| faltas más | 0.568 | -3.67% | -9.97% |

**Conclusión:** ninguno de los 14 mercados bate el margen del 7%; solo "Local anota" es positivo a margen 0% (+3.65%), insuficiente contra el impuesto de la casa. Los mercados derivados son **informativos, no consejos de apuesta**. La calibración por banda tampoco separa rentabilidad (ROI plano entre bandas).

## Historial de trabajo

Hitos principales y qué se arregló:

- **Mercados múltiples (G1-G4)**: añadió modelos de conteo (corners, bookings, tiros, faltas) con Negativo-Binomial, Dixon-Coles de primera mitad, condicional empírica HT/FT y ~20 mercados derivados puros en `app/models/markets.py`. El web los muestra en el detalle del partido.
- **Validación**: baseline empírico y skill para los conteos, además de log-loss/RPS/accuracy/calibración del FT.
- **Backtest**: rentabilidad de los 14 mercados con cuotas sintéticas SBOBET. Corrigió bugs de asentamiento (el "más X" de conteos se asentaba con goles en vez de los conteos; doble oportunidad usaba un solo ganador en vez del conjunto; línea de hándicap 0.5→-0.5).
- **Forma reciente**: covariable de media móvil (k=5) por equipo en los modelos de conteo. Corrigió la indexación de la forma al entrenar (acceso posicional vs por etiqueta en `rolling_form`).
- **Robustez del server**: re-predice fixtures guardados con formato de predicción viejo; protección de `/api/refresh` con token + rate-limit; CORS y cabeceras de seguridad; sync tolerante a fallos de ESPN y ml-service.
- **Observabilidad del sync**: el server persiste el motivo de cada predicción faltante (`skip_reason`: liga sin modelo, equipo sin datos, fallo del modelo) y el web lo explica con etiquetas precisas; un reintento inmediato absorbe fallas transitorias del ml-service.
- **Calidad**: eslint/prettier (web y server) y ruff (ml-service); tests con vitest y pytest; lock de dependencias Python.
- **Operación (Paso 7)**: re-predicción automática al reentrenar (el server compara `trained_at` del modelo y fuerza re-predicción de los partidos pendientes); cron de sync configurable (`SYNC_CRON`); CI en GitHub Actions (lint + tests en los 3 servicios). Las bandas de confianza pasan a tener una única fuente de verdad (`GET /bands` en el ml-service) y la UI degrada con elegancia si falta un modelo de mercado.

## Puesta en marcha

Requisitos: Node.js >= 22 (usa `node:sqlite` y `fetch` nativo), Python >= 3.11, npm.

Orden de arranque: primero el modelo, luego el server, luego el web.

### 1) ml-service (modelos)

```bash
cd ml-service
pip install -r requirements.txt        # o el lock: pip install -r requirements.lock
python scripts/train.py                # solo si faltan los artefactos (ml-service/artifacts/)
uvicorn app.api:app --port 8001        # o: python -m uvicorn app.api:app --port 8001
```

Health-check: `GET http://127.0.0.1:8001/health` → `{"status": "ok", ...}`.

### 2) server (Express + SQLite + ESPN)

```bash
cd server
cp ../.env.example .env                # ajusta PORT / ML_URL / REFRESH_TOKEN si hace falta
npm install
npm run dev                            # desarrollo (tsx watch)
npm start                              # producción (tsx)
```

El server hace health-check a `http://127.0.0.1:8001/health` al arrancar (reintenta 24 veces cada 5 s) y sincroniza fixtures vía cron a las 06:00.

### 3) web (frontend)

```bash
cd web
npm install
npm run dev                            # http://localhost:5173 (proxy /api -> 4000)
```

En producción:

```bash
cd web
npm run build                          # genera dist/
npm run preview                        # sirve el build localmente
```

## Variables de entorno

Ver `.env.example` (raíz) y `web/.env.example`.

- `PORT` (server, default 4000), `ML_URL` (default `http://127.0.0.1:8001`)
- `SYNC_CRON` (server): horario del cron de sincronización en formato node-cron (default `0 6 * * *`)
- `DB_PATH` (ruta de la DB; default `server/data/futbol.db`)
- `REFRESH_TOKEN`: token requerido por `POST /api/refresh`. Genera uno con:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `CORS_ORIGINS`: origenes permitidos separados por coma (vacío = todos, para dev)
- `VITE_API_URL` (web): en producción apunta al server; en dev no hace falta (proxy de Vite)

## API

Server (`/api`, puerto 4000):

- `GET /api/leagues` — ligas y si tienen modelo
- `GET /api/fixtures?league=XX` — fixtures con predicción y detalle (matriz de marcador, goles esperados, over 2.5, BTTS, mercados)
- `GET /api/stats` — precisión total y por banda de confianza
- `POST /api/refresh` — fuerza sync (requiere `REFRESH_TOKEN`)

ml-service (puerto 8001):

- `POST /predict` — predicción completa de un par de equipos: 1X2, HT, HT/FT, mercados de conteo, primer gol/córner
- `GET /teams?league=EC1` — equipos del modelo de una liga (sin league: modelo global)
- `GET /health` — estado, nº de equipos y `trained_at` (timestamp del último entrenamiento)
- `GET /models` — qué modelos hay cargados (ft, ft_ec1, ht, ht_ft_conditional, counts)
- `GET /bands` — bandas de confianza con rangos explícitos (`level`, `label`, `lo`, `hi`); fuente de verdad del server

## Calidad

```bash
# web (React)
cd web && npm run lint && npm test && npm run typecheck

# server (Express)
cd server && npm run lint && npm test && npm run typecheck

# ml-service (Python)
cd ml-service && python -m ruff check app tests scripts && python -m ruff format --check . && python -m pytest tests -q
```

Smoke E2E del web (requiere el stack arriba: ml-service, server y el dev server del web):

```bash
cd web && npm run test:e2e
```

Usa `playwright-core` con el Chrome/Edge del sistema (sin descargar navegadores). Verifica en navegador real: tabs de ligas, tarjetas con predicción, expansión del detalle, sección de mercados y ausencia de errores de consola.

Tests: vitest (web y server), pytest (ml-service). El lock de dependencias Python está en `ml-service/requirements.lock` (generado con `pip freeze`).

## Roadmap

Estado actual: seguridad, pulido visual, smoke E2E, `node-cron@4` y robustez del sync (motivo de predicción faltante) están implementados. El bloque de datos con `firecrawl` está descartado: los CSVs de `ml-service/data/` cubren 2014-2025 y solo se regenerarían ante pérdida o extensión de la ventana.

Pendiente, con disparadores condicionales:

- **Paso 5 — Recalibración por banda** (diferido): el backtest muestra ROI plano entre bandas y la calibración no separa rentabilidad (`scripts/backtest.py`). Se retomará **solo si el proyecto se monetiza**. Antes de arrancar, correr `python scripts/validate.py` y comparar el `rate` empírico por banda con la etiqueta: si la calibración es correcta, el esfuerzo es un no-op.
- **Paso 6 — G5 goleador** (diferido): mercados a nivel jugador (anytime scorer, primer gol de jugador, top scorer). Los CSVs de football-data.co.uk son solo a nivel equipo, así que requiere una fuente con goleadores por partido. Se retomará **solo si ESPN expone goleadores por evento** en la API que el server ya consume (sin scraping ni ToS gris); si la única vía es Understat/FBref (scraping frágil) o una API de pago, no vale la pena. Requiere spec propia antes de implementar.

## Notas de desarrollo

**Gotchas operativos:**

- `python scripts/download_data.py` está bloqueado en la red local (football-data.co.uk requiere proxy). Los CSVs de `ml-service/data/` ya descargados están gitignored.
- Las bandas de confianza las define el ml-service (`GET /bands`); el server las cachea y usa un fallback en `server/src/bands.ts` si el modelo no responde.

**Ejemplo de API (ml-service en 8001):**

```bash
curl -X POST http://127.0.0.1:8001/predict \
  -H "Content-Type: application/json" \
  -d '{"home": "Arsenal", "away": "Chelsea"}'
```

Respuesta (resumen): `probabilities` (home/draw/away), `scoreline` más probable, `over_25`/`under_25`, `btts_yes`/`btts_no`, `expected_goals`, `pick` (H/D/A), `confidence` (banda), `score_matrix` 6x6 y `markets` con FT, HT, HT/FT, conteos y primer gol/córner.

**Mapa del monorepo:**

```
ml-service/
  app/
    api.py                  # FastAPI: /predict, /teams, /health, /models
    data.py                 # carga de CSVs de football-data.co.uk
    models/
      dixon_coles.py        # Dixon-Coles FT y HT
      count_model.py        # Negativo-Binomial + forma reciente
      markets.py            # derivación de ~20 mercados
  scripts/
    download_data.py        # descarga de históricos (requiere proxy)
    train.py                # entrena todo y guarda artifacts/*.npz
    validate.py             # walk-forward + baseline + skill
    backtest.py             # ROI por mercado y por banda
  tests/                    # pytest (21 tests)
  data/, artifacts/         # gitignored; se regeneran con train.py
server/
  src/
    index.ts                # Express, health-check y cron de sync (SYNC_CRON, default 06:00)
    config.ts               # env (PORT, ML_URL, SYNC_CRON, DB_PATH, REFRESH_TOKEN, CORS_ORIGINS)
    db.ts                   # SQLite (node:sqlite): fixtures, picks, stats, meta
    bands.ts                # bandas de confianza (GET /bands del modelo + fallback)
    teams.ts                # resuelve nombres ESPN -> modelo
    providers/espn.ts       # cliente de la API de ESPN
    routes/api.ts           # /api/leagues, /api/fixtures, /api/stats, /api/refresh
    services/predict.ts     # orquesta predicción, hasMarkets, backfill, re-predicción por trained_at
web/
  src/
    App.tsx, main.tsx, api.ts
    bands.ts                # umbrales y etiquetas de confianza
    components/             # MatchCard, Markets, ProbabilityBar, ConfidenceBadge
```

## Límites

- Solo 5 ligas tienen el modelo global (E0, SP1, I1, D1, F1); Liga Pro (EC1) usa un modelo Dixon-Coles por liga entrenado con histórico de ESPN (`dixon_coles_ec1.npz`).
- Liga Pro solo predice el marcador completo (FT): los mercados de conteo (corners, bookings, tiros, faltas) y el de primera mitad usan el baseline del modelo global.
- Los equipos ascendidos de la Liga Pro recientes tienen parámetros débiles por poco histórico; el server marca `team_not_in_model` si no hay datos suficientes.
- Las bandas de confianza son referencia, no certeza: los modelos de fútbol aciertan ~50-55% de los resultados.
- Ningún mercado bate el margen de la casa en el backtest: la app es informativa, no un sistema de apuestas.