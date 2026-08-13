# FutbolTipster

Predicciones 1X2 de fútbol con un modelo estadístico Dixon-Coles (1997). Sin apuestas: muestra probabilidades y bandas de confianza como referencia.

## Arquitectura

Monorepo de tres servicios:

| Servicio | Tecnología | Puerto | Ruta |
|----------|------------|--------|------|
| `ml-service` | Python / FastAPI | 8001 | `/predict`, `/teams`, `/health` |
| `server` | Node / Express + SQLite | 4000 | `/api/*` (orquesta ESPN, predicciones y tracking) |
| `web` | React 19 / Vite / Tailwind v4 | 5173 | SPA |

Flujo: el server consume la API de ESPN, resuelve los nombres de equipos contra el modelo (`teams.ts`), pide predicciones al ml-service y persiste fixtures/picks en SQLite (`server/data/futbol.db`). El web solo lee `/api`.

## Requisitos

- Node.js >= 22 (usa `node:sqlite` y `fetch` nativo)
- Python >= 3.11
- npm

## Puesta en marcha

Orden de arranque: primero el modelo, luego el server, luego el web.

```bash
# 1) ml-service (modelo Dixon-Coles)
cd ml-service
pip install -r requirements.txt        # o desde el lock: pip install -r requirements.lock
uvicorn app.api:app --port 8001

# 2) server (Express + SQLite + ESPN)
cd server
cp ../.env.example .env                # ajusta PORT/ML_URL si hace falta
npm install
npm run dev

# 3) web (frontend)
cd web
npm install
npm run dev                            # http://localhost:5173 (proxy /api -> 4000)
```

El server hace un health-check a `http://127.0.0.1:8001/health` al arrancar y reintenta hasta que el ml-service responda antes del primer sync.

## Datos y modelo

1. **Descargar históricos** (football-data.co.uk vía proxy, bloqueado en la red local):

   ```bash
   cd ml-service && python scripts/download_data.py
   ```

   Guarda CSVs por liga y temporada en `ml-service/data/` (2014-2025, 5 ligas europeas).

2. **Entrenar** el modelo (un modelo global por ahora):

   ```bash
   python scripts/train.py     # genera artifacts/dixon_coles.npz
   ```

3. **Validar** con walk-forward (log-loss, RPS, accuracy, calibración por banda):

   ```bash
   python scripts/validate.py
   ```

Resultados de referencia (3 temporadas out-of-sample 2023-2025): log-loss ~0.99, RPS ~0.20, accuracy ~52%, calibración Seguro ~74% real vs 72% predicho. Un ensamble con XGBoost se probó y se descartó por no superar el umbral de mejora (ver `scripts/validate.py`).

## Variables de entorno

Ver `.env.example` (raíz) y `web/.env.example`. En producción, el web necesita `VITE_API_URL` apuntando al server si no usa proxy.

## Calidad

```bash
# web (React)
cd web && npm run lint && npm test && npm run typecheck

# server (Express)
cd server && npm run lint && npm test && npm run typecheck

# ml-service (Python)
cd ml-service && python -m ruff check app tests scripts && python -m ruff format --check . && python -m pytest tests -q
```

- Tests: vitest (web y server) y pytest (ml-service). El lock de dependencias de Python está en `ml-service/requirements.lock` (generado con `pip freeze`).

## API

- `GET /api/leagues` — ligas y si tienen modelo
- `GET /api/fixtures?league=XX` — fixtures con predicción y detalle (matriz de marcador, goles esperados, over 2.5, BTTS)
- `GET /api/stats` — precisión total y por banda de confianza
- `POST /api/refresh` — fuerza sync (requiere `REFRESH_TOKEN`)
- `POST /predict` (ml-service) — predicción 1X2 de un par de equipos
- `GET /health` (ml-service) — estado del modelo

## Límites

- Solo 5 ligas tienen modelo (E0, SP1, I1, D1, F1). Liga Pro (EC1) se muestra sin predicción.
- Las bandas de confianza son referencia, no certeza: los modelos de fútbol aciertan ~50-55% de los resultados.
- Los equipos de la Liga Pro no están en el modelo; el server no genera predicción para esa liga.