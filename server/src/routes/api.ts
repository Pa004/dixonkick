import { Router } from "express";
import { LEAGUES, REFRESH_TOKEN } from "../config.js";
import { db } from "../db.js";
import { runSync } from "../services/predict.js";

const BANDS: [string, number, number][] = [
  ["Seguro", 0.65, 1.01],
  ["Probable", 0.55, 0.65],
  ["Ajustado", 0.45, 0.55],
  ["Incierto", 0, 0.45],
];

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const api = Router();

api.get("/leagues", (_req, res) => {
  res.json(
    Object.entries(LEAGUES).map(([code, l]) => ({
      code,
      label: l.label,
      hasModel: Boolean(l.model),
    })),
  );
});

api.get("/fixtures", (req, res) => {
  const league = String(req.query.league ?? "");
  const rows = db
    .prepare(
      "SELECT * FROM fixtures WHERE (? = '' OR league = ?) AND date > datetime('now', '-2 days') ORDER BY date LIMIT 100",
    )
    .all(league, league) as Record<string, unknown>[];
  res.json(rows.map((r) => ({
    id: r.id,
    league: r.league,
    date: r.date,
    home: r.home,
    away: r.away,
    homeShort: r.home_short,
    awayShort: r.away_short,
    status: r.status,
    homeScore: r.home_score,
    awayScore: r.away_score,
    prediction: r.prediction ? safeJson(r.prediction as string) : null,
    predictedAt: r.predicted_at,
  })));
});

api.get("/stats", (_req, res) => {
  const totals = db
    .prepare("SELECT COUNT(*) n, SUM(hit) hits FROM tracked")
    .get() as { n: number; hits: number };
  const bands = BANDS.map(([label, lo, hi]) => {
    const row = db
      .prepare("SELECT COUNT(*) n, SUM(hit) hits FROM tracked WHERE confidence >= ? AND confidence < ?")
      .get(lo, hi) as { n: number; hits: number };
    return {
      band: label,
      count: row.n,
      accuracy: row.n > 0 ? row.hits / row.n : null,
    };
  });
  res.json({
    totalTracked: totals.n,
    overallAccuracy: totals.n > 0 ? totals.hits / totals.n : null,
    bands,
  });
});

// Rate limit en memoria para /refresh (evita DoS trivial)
const refreshHits = new Map<string, { count: number; resetAt: number }>();
const REFRESH_LIMIT = 5;
const REFRESH_WINDOW_MS = 60_000;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = refreshHits.get(key);
  if (!entry || entry.resetAt < now) {
    refreshHits.set(key, { count: 1, resetAt: now + REFRESH_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > REFRESH_LIMIT;
}

api.post("/refresh", (req, res) => {
  if (!REFRESH_TOKEN) {
    res.status(503).json({ error: "REFRESH_TOKEN no configurado" });
    return;
  }
  if (req.header("x-refresh-token") !== REFRESH_TOKEN) {
    res.status(401).json({ error: "token inválido" });
    return;
  }
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "demasiadas solicitudes" });
    return;
  }
  runSync()
    .then((result) => res.json(result))
    .catch((err) => res.status(502).json({ error: (err as Error).message }));
});