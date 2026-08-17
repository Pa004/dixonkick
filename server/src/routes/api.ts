import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getBands } from "../bands.js";
import { LEAGUES, REFRESH_TOKEN } from "../config.js";
import { localToday } from "../dates.js";
import { db } from "../db.js";
import { safeJson } from "../lib/json.js";
import { runSync } from "../services/predict.js";

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Express 4 no captura rechazos de promises; este wrapper reenvía el error al
// middleware de errores para que no se tire el proceso con un unhandledRejection.
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown> | unknown,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
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
  // "Hoy" se calcula en la zona configurada (no UTC): el prefijo de fecha local
  // incluye los partidos del día de calendario local hacia adelante.
  const rows = db
    .prepare("SELECT * FROM fixtures WHERE (? = '' OR league = ?) AND date >= ? ORDER BY date LIMIT 100")
    .all(league, league, localToday()) as Record<string, unknown>[];
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
      prediction: r.prediction ? safeJson<object>(r.prediction as string) : null,
      predictedAt: r.predicted_at,
      skipReason: r.skip_reason ?? null,
    })),
  );
});

api.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const rows = db.prepare("SELECT confidence, hit FROM tracked").all() as {
      confidence: number;
      hit: number;
    }[];
    const totals = { n: rows.length, hits: rows.reduce((sum, r) => sum + r.hit, 0) };
    const bands = (await getBands()).map((b) => {
      const inBand = rows.filter((r) => r.confidence >= b.lo && r.confidence < b.hi);
      return {
        band: b.label,
        level: b.level,
        count: inBand.length,
        accuracy: inBand.length > 0 ? inBand.reduce((sum, r) => sum + r.hit, 0) / inBand.length : null,
      };
    });
    res.json({
      totalTracked: totals.n,
      overallAccuracy: totals.n > 0 ? totals.hits / totals.n : null,
      bands,
    });
  }),
);

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
