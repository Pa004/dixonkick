import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BANDS, getBands, resetBandsCache } from "./bands.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetBandsCache();
});

describe("getBands", () => {
  it("usa el fallback por defecto si ml-service no responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    expect(await getBands()).toEqual(DEFAULT_BANDS);
  });

  it("usa las bandas del ml-service cuando responde", async () => {
    const bands = [
      { level: "seguro", label: "Seguro", lo: 0.7, hi: 1.01 },
      { level: "incierto", label: "Incierto", lo: 0, hi: 0.45 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(bands), { status: 200 })),
    );
    expect(await getBands()).toEqual(bands);
  });

  it("mantiene el fallback si ml-service devuelve un formato inválido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    expect(await getBands()).toEqual(DEFAULT_BANDS);
  });
});