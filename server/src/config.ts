import { fileURLToPath } from "node:url";

export const PORT = Number(process.env.PORT) || 4000;
export const ML_URL = process.env.ML_URL || "http://127.0.0.1:8001";
export const SYNC_CRON = process.env.SYNC_CRON || "0 6 * * *";

export const LEAGUES: Record<string, { espn: string; label: string; model: string | null }> = {
  E0: { espn: "eng.1", label: "Premier League", model: "E0" },
  SP1: { espn: "esp.1", label: "La Liga", model: "SP1" },
  I1: { espn: "ita.1", label: "Serie A", model: "I1" },
  D1: { espn: "ger.1", label: "Bundesliga", model: "D1" },
  F1: { espn: "fra.1", label: "Ligue 1", model: "F1" },
  EC1: { espn: "ecu.1", label: "Liga Pro", model: null },
};

export const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL("../data/futbol.db", import.meta.url));

export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const REFRESH_TOKEN = process.env.REFRESH_TOKEN ?? "";
