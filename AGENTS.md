# FutbolTipster — AGENTS.md

Predicciones 1X2 y mercados derivados con modelos estadísticos. Tres servicios independientes en un monorepo; cada uno con su propio package.json/requirements y calidad.

## Arquitectura (flujo de datos)

```
ESPN (scoreboard por liga)
   │  server/providers/espn.ts   ventana -2..+14 días
   ▼
server (Express, :4000)
   │  sync por cron (SYNC_CRON, default 0 6 * * *)
   │  runSync → refreshFixtures → resolveTeam(name, league) + predictFixture(home, away, league)
   │  SQLite: server/data/futbol.db  (fixtures, tracked, meta)
   ▼
ml-service (FastAPI, :8001)
   │  /predict  /teams?league=  /health  /models  /bands
   │  modelos cargados de ml-service/artifacts/*.npz al arrancar
   ▼
web (React+Vite, :5173)  consume /api del server (proxy Vite)
```

## Mapa de archivos

### server/ (TypeScript, Express)
- `src/index.ts` — arranque, cabeceras de seguridad, CORS fail-closed, cron, `tick()` al arranque tras esperar ml-service.
- `src/config.ts` — `LEAGUES` (única fuente de verdad de ligas: E0, SP1, I1, D1, F1 con modelo global; EC1 con modelo por-liga), puertos, cron, CORS, token.
- `src/routes/api.ts` — `/leagues`, `/fixtures?league=`, `/stats`, `/refresh` (token + rate limit en memoria).
- `src/services/predict.ts` — `runSync` (force si el modelo se reentrenó vía `meta.ml_trained_at`), `refreshFixtures`, `checkResults` (asienta resultados en `tracked`).
- `src/teams.ts` — resuelve displayName ESPN → nombre del modelo: caché/inflight por liga (`getModelTeams`), `OVERRIDES` normalizados (minúsculas sin acentos ni puntuación), fuzzy ≥ 0.8. **EC1 y global son espacios separados** (`modelFor`).
- `src/providers/espn.ts` — fetch del scoreboard de ESPN (UA `futboltipster/0.1`).
- `src/db.ts` — SQLite (node:sqlite, `DatabaseSync`), esquema + migración de columnas.
- `src/bands.ts` — bandas de confianza (cachea `/bands` del ml-service, con fallback).

### ml-service/ (Python, FastAPI)
- `app/api.py` — `Models.load()` (ft, ft_ec1, ht, htft_cond, counts), `select_model(league)` (EC1 → por-liga; resto → global), `build_prediction`.
- `app/models/` — `dixon_coles.py` (FT/HT + bandas), `count_model.py` (corners/bookings/SOT/fouls con forma reciente k=5), `markets.py` (mercados derivados).
- `app/data.py` — `load_history` de `ml-service/data/*.csv`; tolerante a columnas faltantes (EC1 de ESPN trae solo marcadores; reindex con NaN).
- `scripts/` — `download_data.py` (football-data.co.uk, 5 ligas europeas), `download_espn_ecuador.py` (histórico ESPN para EC1), `train.py` (`--league EC1` entrena solo EC1; sin flag entrena todo), `validate.py`, `backtest.py`.
- `artifacts/` — `dixon_coles.npz` (global, 5 ligas), `dixon_coles_ec1.npz` (Liga Pro por-liga), ht, htft_cond, counts. Regenerables con train.py; **el global no se re-fitea con `--league EC1`**.

### web/ (React 19 + Vite + Tailwind v4)
- `src/App.tsx` — tabs de ligas, auto-refresh silencioso cada 60s, estados loading/error/empty.
- `src/components/` — `MatchCard`, `Markets`, `ProbabilityBar`, `ConfidenceBadge`.
- `src/api.ts`, `src/bands.ts` — cliente y bandas del lado web.

## Conceptos clave
- **Modelo global vs por-liga**: 5 ligas europeas comparten un modelo único (concatenadas). EC1 tiene modelo propio entrenado con histórico ESPN. El server decide con `modelFor(league)` y el ml-service con `select_model(league)`.
- **skip_reason**: `no_model`, `team_not_in_model`, `predict_failed` — explica en la UI por qué un partido no tiene predicción.
- **force en sync**: si `trained_at` del ml-service cambió, se re-predicen todos los pendientes (las predicciones guardadas quedan obsoletas).
- **limitaciones**: EC1 solo predice FT; conteos/HT de EC1 salen del baseline global. Ver "Límites" en README.md.

## Verificación (siempre al terminar cambios)
- server: `npm test`, `npm run lint`, `npm run typecheck` (en `server/`)
- ml-service: `pytest` (en `ml-service/`)
- web: `npm test`, `npm run typecheck` (en `web/`); E2E smoke: `npm run test:e2e` (requiere servicios levantados)
- Arranque (orden): ml-service → server → web. Ver `README.md` para comandos exactos.

## Reglas del repo
- Commits en español, convencionales, un commit por cambio lógico. No push sin confirmar.
- No tocar `ml-service/data/`, `ml-service/artifacts/`, `server/data/` (gitignoreados, regenerables).
- El modelo global de las 5 ligas no se modifica bajo ningún caso (ver decisión en commit `b05e966`).