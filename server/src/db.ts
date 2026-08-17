import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./config.js";

// Solo se crea el directorio cuando la BD es un archivo real (no :memory: en tests)
if (DB_PATH !== ":memory:") {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  league TEXT NOT NULL,
  date TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  home_short TEXT,
  away_short TEXT,
  status TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  home_model TEXT,
  away_model TEXT,
  predicted_at TEXT,
  prediction TEXT,
  skip_reason TEXT,
  result_checked INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fixtures_league_date ON fixtures(league, date);
CREATE TABLE IF NOT EXISTS tracked (
  fixture_id TEXT PRIMARY KEY,
  pick TEXT NOT NULL,
  confidence REAL NOT NULL,
  outcome TEXT NOT NULL,
  hit INTEGER NOT NULL,
  resolved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migraciones para bases existentes (CREATE TABLE IF NOT EXISTS no altera)
const fixtureCols = db.prepare("PRAGMA table_info(fixtures)").all() as { name: string }[];
if (!fixtureCols.some((c) => c.name === "skip_reason")) {
  db.exec("ALTER TABLE fixtures ADD COLUMN skip_reason TEXT");
}
if (!fixtureCols.some((c) => c.name === "home_logo")) {
  db.exec("ALTER TABLE fixtures ADD COLUMN home_logo TEXT");
}
if (!fixtureCols.some((c) => c.name === "away_logo")) {
  db.exec("ALTER TABLE fixtures ADD COLUMN away_logo TEXT");
}
