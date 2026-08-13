import { LEAGUES, ML_URL } from "../config.js";
import { db } from "../db.js";
import { fetchLeagueFixtures } from "../providers/espn.js";
import { resolveTeam } from "../teams.js";

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

export async function refreshFixtures(): Promise<{ inserted: number; predicted: number }> {
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
      const upsert = db.prepare(`
        INSERT INTO fixtures
          (id, league, date, home, away, home_short, away_short, status, home_score, away_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date=excluded.date, status=excluded.status,
          home_score=excluded.home_score, away_score=excluded.away_score
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
      );
      inserted++;

      if (fx.status === "pre" && league.model && !existing?.prediction) {
        tasks.push({ id: fx.id, home: fx.home, away: fx.away });
      }
    }
  }

  let predicted = 0;
  await mapLimit(tasks, 5, async ({ id, home, away }) => {
    try {
      const homeModel = await resolveTeam(home);
      const awayModel = await resolveTeam(away);
      if (!homeModel || !awayModel) return;
      const pred = await predictFixture(homeModel, awayModel);
      db.prepare(
        "UPDATE fixtures SET home_model=?, away_model=?, prediction=?, predicted_at=datetime('now') WHERE id=?",
      ).run(homeModel, awayModel, JSON.stringify(pred), id);
      predicted++;
    } catch (err) {
      // sin prediccion: se deja null, se reintenta en el proximo refresh
      console.error(`[sync] prediccion ${id} (${home} vs ${away}) falló: ${(err as Error).message}`);
    }
  });

  return { inserted, predicted };
}

let syncing = false;

export async function runSync(): Promise<{ inserted: number; predicted: number; checked: number }> {
  if (syncing) return { inserted: 0, predicted: 0, checked: 0 };
  syncing = true;
  try {
    const { inserted, predicted } = await refreshFixtures();
    const checked = checkResults();
    return { inserted, predicted, checked };
  } finally {
    syncing = false;
  }
}

export function checkResults(): number {
  const pending = db
    .prepare(
      "SELECT * FROM fixtures WHERE status='post' AND result_checked=0 AND prediction IS NOT NULL AND home_score IS NOT NULL",
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
