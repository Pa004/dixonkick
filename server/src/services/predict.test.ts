import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";

vi.mock("../providers/espn.js", () => ({
  fetchLeagueFixtures: vi.fn(),
}));
vi.mock("../teams.js", () => ({
  resolveTeam: vi.fn(),
}));

import { fetchLeagueFixtures } from "../providers/espn.js";
import { resolveTeam } from "../teams.js";

const espnMock = vi.mocked(fetchLeagueFixtures);
const teamsMock = vi.mocked(resolveTeam);

let predict: typeof import("../services/predict.js");
let db: DatabaseSync;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  predict = await import("../services/predict.js");
  ({ db } = await import("../db.js"));
});

afterEach(() => {
  espnMock.mockReset();
  teamsMock.mockReset();
  vi.unstubAllGlobals();
});

function seedFixture(overrides: Record<string, string | number | null> = {}) {
  db.prepare(
    `INSERT INTO fixtures (id, league, date, home, away, home_short, away_short, status, home_score, away_score, prediction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    overrides.id ?? "fx-1",
    overrides.league ?? "E0",
    overrides.date ?? "2026-08-13T18:00Z",
    overrides.home ?? "Home",
    overrides.away ?? "Away",
    "HOM",
    "AWY",
    overrides.status ?? "pre",
    overrides.home_score ?? null,
    overrides.away_score ?? null,
    overrides.prediction ?? null,
  );
}

describe("checkResults", () => {
  it("ignora una prediction corrupta sin abortar el resto", () => {
    seedFixture({ status: "post", home_score: 1, away_score: 0, prediction: "not-json" });
    seedFixture({
      id: "fx-2",
      status: "post",
      home_score: 2,
      away_score: 1,
      prediction: JSON.stringify({ pick: "H", confidence: { probability: 0.7 } }),
    });

    expect(() => predict.checkResults()).not.toThrow();

    const corrupt = db.prepare("SELECT result_checked FROM fixtures WHERE id='fx-1'").get() as {
      result_checked: number;
    };
    expect(corrupt.result_checked).toBe(1);
    const tracked = db.prepare("SELECT COUNT(*) n FROM tracked").get() as { n: number };
    expect(tracked.n).toBe(1);
  });

  it("contabiliza el pick acertado", () => {
    seedFixture({
      id: "fx-3",
      status: "post",
      home_score: 3,
      away_score: 0,
      prediction: JSON.stringify({ pick: "H", confidence: { probability: 0.8 } }),
    });
    predict.checkResults();
    const row = db.prepare("SELECT pick, hit FROM tracked WHERE fixture_id='fx-3'").get() as {
      pick: string;
      hit: number;
    };
    expect(row.pick).toBe("H");
    expect(row.hit).toBe(1);
  });
});

describe("refreshFixtures", () => {
  it("procesa las demás ligas si una falla", async () => {
    espnMock.mockImplementation(async (espnLeague) => {
      if (espnLeague === "ecu.1") throw new Error("ESPN 429");
      if (espnLeague === "eng.1") return [fixture("epl-1")];
      return [];
    });
    teamsMock.mockResolvedValue(null);

    const result = await predict.refreshFixtures();
    expect(result.inserted).toBeGreaterThanOrEqual(1);
  });

  it("persiste la predicción cuando los equipos resuelven", async () => {
    espnMock.mockImplementation(async (espnLeague) =>
      espnLeague === "eng.1" ? [fixture("epl-2")] : [],
    );
    teamsMock.mockResolvedValue("Man City");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ pick: "H", confidence: { level: "seguro", probability: 0.7 } }), {
          status: 200,
        }),
      ),
    );

    const result = await predict.refreshFixtures();
    expect(result.predicted).toBe(1);
    const row = db.prepare("SELECT prediction FROM fixtures WHERE id='epl-2'").get() as {
      prediction: string;
    };
    expect(JSON.parse(row.prediction).pick).toBe("H");
  });
});

function fixture(id: string) {
  return {
    id,
    date: "2026-08-13T18:00Z",
    home: "Manchester City",
    away: "Arsenal",
    homeShort: "MCI",
    awayShort: "ARS",
    status: "pre",
    homeScore: null,
    awayScore: null,
  };
}