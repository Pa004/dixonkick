import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import App from "./App";

const mockLeagues = [{ code: "E0", label: "Premier League", hasModel: true }];
const mockStats = { totalTracked: 0, overallAccuracy: null, bands: [] };

vi.mock("./api", () => ({
  fetchLeagues: vi.fn(),
  fetchFixtures: vi.fn(),
  fetchStats: vi.fn(),
}));

import { fetchFixtures, fetchLeagues, fetchStats } from "./api";

beforeEach(() => {
  vi.mocked(fetchLeagues).mockReset();
  vi.mocked(fetchFixtures).mockReset();
  vi.mocked(fetchStats).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("muestra un estado de error con reintento cuando la API falla", async () => {
    vi.mocked(fetchLeagues).mockRejectedValue(new Error("boom"));
    vi.mocked(fetchFixtures).mockRejectedValue(new Error("boom"));
    vi.mocked(fetchStats).mockRejectedValue(new Error("boom"));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza las ligas cuando la API responde", async () => {
    vi.mocked(fetchLeagues).mockResolvedValue(mockLeagues);
    vi.mocked(fetchFixtures).mockResolvedValue([]);
    vi.mocked(fetchStats).mockResolvedValue(mockStats);

    render(<App />);

    expect(await screen.findByRole("tab", { name: /Premier League/ })).toBeInTheDocument();
  });

  it("re-fetchea los datos en el refresco automático", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchLeagues).mockResolvedValue(mockLeagues);
    vi.mocked(fetchFixtures).mockResolvedValue([]);
    vi.mocked(fetchStats).mockResolvedValue(mockStats);

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("tab", { name: /Premier League/ })).toBeInTheDocument();
    expect(fetchFixtures).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchFixtures).toHaveBeenCalledTimes(2);
  });
});
