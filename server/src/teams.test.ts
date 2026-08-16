import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EC1_TEAMS = [
  "9 de Octubre",
  "América de Quito",
  "Aucas",
  "Barcelona SC",
  "Cumbayá",
  "Delfín",
  "Deportivo Cuenca",
  "El Nacional",
  "Emelec",
  "Guayaquil City FC",
  "Independiente del Valle",
  "Libertad (Ecuador)",
  "Liga de Quito",
  "Manta F.C.",
  "Mushuc Runa",
  "Orense",
  "Técnico Universitario",
  "Universidad Católica (Quito)",
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify({ teams: EC1_TEAMS }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("resolveTeam con league EC1", () => {
  it("resuelve el displayName de ESPN contra el modelo ecuatoriano", async () => {
    const { resolveTeam } = await import("./teams.js");
    expect(await resolveTeam("Barcelona SC", "EC1")).toBe("Barcelona SC");
    expect(await resolveTeam("Liga de Quito", "EC1")).toBe("Liga de Quito");
  });

  it("aplica overrides de variantes al modelo EC1", async () => {
    const { resolveTeam } = await import("./teams.js");
    expect(await resolveTeam("LDU Quito", "EC1")).toBe("Liga de Quito");
    expect(await resolveTeam("Ind. del Valle", "EC1")).toBe("Independiente del Valle");
    expect(await resolveTeam("Técnico U.", "EC1")).toBe("Técnico Universitario");
    expect(await resolveTeam("Manta", "EC1")).toBe("Manta F.C.");
  });

  it("consulta /teams?league=EC1 solo para esa liga", async () => {
    const { resolveTeam } = await import("./teams.js");
    await resolveTeam("Barcelona SC", "EC1");
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some((u) => u.includes("?league=EC1"))).toBe(true);
  });

  it("el override de Barcelona SC no altera la resolución global de Barcelona", async () => {
    const { resolveTeam } = await import("./teams.js");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ teams: ["Barcelona", "Real Madrid"] }), { status: 200 }),
    );
    // La liga española sigue resolviendo "Barcelona" contra el modelo global
    expect(await resolveTeam("Barcelona", "E0")).toBe("Barcelona");
  });
});