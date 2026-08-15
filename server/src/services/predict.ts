import { LEAGUES, ML_URL } from "../config.js";
import { db } from "../db.js";
import { fetchLeagueFixtures } from "../providers/espn.js";
import { resolveTeam } from "../teams.js";

function hasMarkets(prediction: string | null | undefined): boolean {
  if (!prediction) return false;
  try {
    const parsed = JSON.parse(prediction) as { markets?: unknown };
    return parsed.markets !== undefined;
  } catch {
    return false;
  }
}

const META_TRAINED_AT = "ml_trained_at";

async function fetchModelTrainedAt(): Promise<string | null> {
  try {
    const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`ml-service /health: ${res.status}`);
    const data = (await res.json()) as { trained_at?: string | null };
    return data.trained_at ?? null;
  } catch {
    return null;
  }
}

function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, value);
}

export async function predictFixture(home: string, away: string): Promise<object> {
  const res = await fetch(`${ML_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ home, away }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ml-service /predict ${res.status}: ${await res.text()}`);
  return (await res.json()) as object;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

export async function refreshFixtures(
  force = false,
): Promise<{ inserted: number; predicted: number }> {
  let inserted = 0;
  const tasks: { id: string; home: string; away: string }[] = [];

  for (const [code, league] of Object.entries(LEAGUES)) {
    let fixtures;
    try {
      fixtures = await fetchLeagueFixtures(league.espn);
    } catch (err) {
      console.error(`[sync] ${code} (${league.espn}) falló: ${(err as Error).message}`);
      continue;
    }
    for (const fx of fixtures) {
      const existing = db.prepare("SELECT home_model, prediction FROM fixtures WHERE id = ?").get(fx.id) as
        { home_model: string | null; prediction: string | null } | undefined;
      // Liga sin modelo: se guarda la razón para que el web explique el estado
      const skipReason = fx.status === "pre" && !league.model ? "no_model" : null;
      const upsert = db.prepare(`
        INSERT INTO fixtures
          (id, league, date, home, away, home_short, away_short, status, home_score, away_score, skip_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date=excluded.date, status=excluded.status,
          home_score=excluded.home_score, away_score=excluded.away_score,
          skip_reason=excluded.skip_reason
      `);
      upsert.run(
        fx.id,
        code,
        fx.date,
        fx.home,
        fx.away,
        fx.homeShort,
        fx.awayShort,
        fx.status,
        fx.homeScore,
        fx.awayScore,
        skipReason,
      );
      inserted++;

      // force = modelo reentrenado: re-predice aunque la predicción ya tenga markets
      if (fx.status === "pre" && league.model && (force || !hasMarkets(existing?.prediction))) {
        tasks.push({ id: fx.id, home: fx.home, away: fx.away });
      }
    }
  }

  let predicted = 0;
  await mapLimit(tasks, 5, async ({ id, home, away }) => {
    try {
      const homeModel = await resolveTeam(home);
      const awayModel = await resolveTeam(away);
      if (!homeModel || !awayModel) {
        // el modelo no tiene datos de alguno de los equipos; sin reintentos que lo arreglen
        db.prepare("UPDATE fixtures SET skip_reason='team_not_in_model' WHERE id=?").run(id);
        return;
      }
      const pred = await predictWithRetry(homeModel, awayModel);
      db.prepare(
        "UPDATE fixtures SET home_model=?, away_model=?, prediction=?, skip_reason=NULL, predicted_at=datetime('now') WHERE id=?",
      ).run(homeModel, awayModel, JSON.stringify(pred), id);
      predicted++;
    } catch (err) {
      db.prepare("UPDATE fixtures SET skip_reason='predict_failed' WHERE id=?").run(id);
      console.error(`[sync] prediccion ${id} (${home} vs ${away}) falló: ${(err as Error).message}`);
    }
  });

  const summary = db
    .prepare("SELECT skip_reason, COUNT(*) n FROM fixtures WHERE status='pre' GROUP BY skip_reason")
    .all() as { skip_reason: string | null; n: number }[];
  console.log(
    "[sync] estado prediccion:",
    summary.map((s) => `${s.skip_reason ?? "predicha"}=${s.n}`).join(", "),
  );

  return { inserted, predicted };
}

// Un reintento inmediato absorbe latencias transitorias del ml-service sin bloquear el sync
async function predictWithRetry(home: string, away: string): Promise<object> {
  try {
    return await predictFixture(home, away);
  } catch {
    return predictFixture(home, away);
  }
}

let syncing = false;

export async function runSync(): Promise<{ inserted: number; predicted: number; checked: number }> {
  if (syncing) return { inserted: 0, predicted: 0, checked: 0 };
  syncing = true;
  try {
    const trainedAt = await fetchModelTrainedAt();
    // Si el modelo se reentrenó, las predicciones guardadas quedan obsoletas:
    // forzar re-predicción de todos los partidos pendientes.
    const force = trainedAt != null && trainedAt !== getMeta(META_TRAINED_AT);
    const { inserted, predicted } = await refreshFixtures(force);
    if (trainedAt != null) setMeta(META_TRAINED_AT, trainedAt);
    const checked = checkResults();
    return { inserted, predicted, checked };
  } finally {
    syncing = false;
  }
}

export function checkResults(): number {
  const pending = db
    .prepare(
      "SELECT * FROM fixtures WHERE status='post' AND result_checked=0 AND prediction IS NOT NULL AND home_score IS NOT NULL AND away_score IS NOT NULL",
    )
    .all() as {
    id: string;
    home_score: number;
    away_score: number;
    prediction: string;
  }[];

  let checked = 0;
  const update = db.prepare(`
    INSERT OR IGNORE INTO tracked (fixture_id, pick, confidence, outcome, hit, resolved_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const fx of pending) {
    let pred: { pick: string; confidence: { probability: number } };
    try {
      pred = JSON.parse(fx.prediction) as { pick: string; confidence: { probability: number } };
    } catch {
      // fila corrupta: se marca como revisada para no reintentar infinitamente
      db.prepare("UPDATE fixtures SET result_checked=1 WHERE id=?").run(fx.id);
      continue;
    }
    const outcome = fx.home_score > fx.away_score ? "H" : fx.home_score < fx.away_score ? "A" : "D";
    update.run(fx.id, pred.pick, pred.confidence.probability, outcome, pred.pick === outcome ? 1 : 0);
    db.prepare("UPDATE fixtures SET result_checked=1 WHERE id=?").run(fx.id);
    checked++;
  }
  return checked;
}
