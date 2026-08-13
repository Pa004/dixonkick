import { Router } from "express";
import { LEAGUES } from "../config.js";
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

api.post("/refresh", async (_req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});