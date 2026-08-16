import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { getBands } from "../bands.js";
import { LEAGUES, REFRESH_TOKEN } from "../config.js";
import { db } from "../db.js";
import { runSync } from "../services/predict.js";

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
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
      "SELECT * FROM fixtures WHERE (? = '' OR league = ?) AND date >= datetime('now', 'start of day') ORDER BY date LIMIT 100",
    )
    .all(league, league) as Record<string, unknown>[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      league: r.league,
      date: r.date,
      home: r.home,
      away: r.away,
      homeShort: r.home_short,
      awayShort: r.away_short,
      homeLogo: r.home_logo ?? null,
      awayLogo: r.away_logo ?? null,
      status: r.status,
      homeScore: r.home_score,
      awayScore: r.away_score,
      prediction: r.prediction ? safeJson(r.prediction as string) : null,
      predictedAt: r.predicted_at,
      skipReason: r.skip_reason ?? null,
    })),
  );
});

api.get("/stats", async (_req, res) => {
  const totals = db.prepare("SELECT COUNT(*) n, SUM(hit) hits FROM tracked").get() as {
    n: number;
    hits: number;
  };
  const bands = (await getBands()).map((b) => {
    const row = db
      .prepare("SELECT COUNT(*) n, SUM(hit) hits FROM tracked WHERE confidence >= ? AND confidence < ?")
      .get(b.lo, b.hi) as { n: number; hits: number };
    return {
      band: b.label,
      level: b.level,
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

// Rate limit en memoria por IP y por token (evita DoS trivial sobre /refresh)
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;

function rateLimited(key: string, limit: number): boolean {
  if (hits.size > 5000) {
    const now = Date.now();
    for (const [k, v] of hits) {
      if (v.resetAt < now) hits.delete(k);
    }
  }
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

api.post("/refresh", (req, res) => {
  if (!REFRESH_TOKEN) {
    res.status(503).json({ error: "REFRESH_TOKEN no configurado" });
    return;
  }
  if (!tokensEqual(req.header("x-refresh-token") ?? "", REFRESH_TOKEN)) {
    res.status(401).json({ error: "token inválido" });
    return;
  }
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (rateLimited(`refresh-ip:${ip}`, 10) || rateLimited(`refresh-token:${REFRESH_TOKEN}`, 30)) {
    res.status(429).json({ error: "demasiadas solicitudes" });
    return;
  }
  runSync()
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("[refresh]", (err as Error).message);
      res.status(502).json({ error: "error de sincronización" });
    });
});
