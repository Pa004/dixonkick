import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Markets from "./Markets";
import type { Markets as MarketsData } from "../api";

const MARKETS: MarketsData = {
  ft: {
    double_chance: { "1X": 0.75, "12": 0.6, X2: 0.5 },
    over_under: { "2.5": { over: 0.43, under: 0.57 } },
    asian_handicap: { "-0.5": { home_cover: 0.55 }, "0": { home_cover: 0.5 } },
    odd_even: { odd: 0.52, even: 0.48 },
    team_totals: { "1.5": { home_over: 0.6, away_over: 0.4 } },
    clean_sheet: { home: 0.32, away: 0.28 },
    correct_score_top: [{ home: 1, away: 0, prob: 0.12 }],
  },
  ht: {
    probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
    double_chance: { "1X": 0.7, "12": 0.7, X2: 0.6 },
    over_under: { "0.5": { over: 0.63, under: 0.37 } },
    btts_yes: 0.3,
    expected_goals: { home: 0.6, away: 0.4 },
  },
  ht_ft: [
    { ht: "H", ft: "H", prob: 0.3 },
    { ht: "D", ft: "H", prob: 0.2 },
    { ht: "A", ft: "A", prob: 0.1 },
  ],
  corners: {
    total: { "8.5": { over: 0.48, under: 0.52 } },
    team_totals: { "4.5": { home_over: 0.52, away_over: 0.32 } },
    most: { home: 0.43, draw: 0.29, away: 0.28 },
    handicap: { "-1.5": { home_cover: 0.46 } },
    expected: { home: 4.9, away: 3.7 },
  },
  bookings: {
    total: { "3.5": { over: 0.42, under: 0.58 } },
    team_totals: { "1.5": { home_over: 0.5, away_over: 0.5 } },
    most: { home: 0.3, draw: 0.3, away: 0.4 },
    handicap: { "-1.5": { home_cover: 0.3 } },
    expected: { home: 1.5, away: 1.8 },
  },
  shots_on_target: {
    total: { "8.5": { over: 0.3, under: 0.7 } },
    team_totals: { "3.5": { home_over: 0.5, away_over: 0.4 } },
    most: { home: 0.4, draw: 0.3, away: 0.3 },
    handicap: { "-1.5": { home_cover: 0.4 } },
    expected: { home: 5, away: 4 },
  },
  fouls: {
    total: { "20.5": { over: 0.5, under: 0.5 } },
    team_totals: { "9.5": { home_over: 0.5, away_over: 0.5 } },
    most: { home: 0.5, draw: 0.2, away: 0.3 },
    handicap: { "-2.5": { home_cover: 0.3 } },
    expected: { home: 11, away: 10 },
  },
  first_goal: { home: 0.48, away: 0.43, none: 0.09 },
  first_corner: { home: 0.57, away: 0.43, none: 0 },
};

describe("Markets", () => {
  it("lista todas las secciones de mercado", () => {
    render(<Markets markets={MARKETS} />);
    expect(screen.getByRole("heading", { name: "Mercados" })).toBeInTheDocument();
    for (const title of [
      "Resultado",
      "Marcadores exactos",
      "Primera mitad",
      "HT/FT",
      "Córners",
      "Tarjetas",
      "Tiros a puerta",
      "Faltas",
      "Primer evento",
    ]) {
      expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
    }
  });

  it("abre una seccion al expandirla", () => {
    render(<Markets markets={MARKETS} />);
    const btn = screen.getByRole("button", { name: "Resultado" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Doble oportunidad")).toBeInTheDocument();
  });

  it("resalta el valor con mayor probabilidad", () => {
    render(<Markets markets={MARKETS} />);
    fireEvent.click(screen.getByRole("button", { name: "Resultado" }));
    expect(screen.getByText("1X 75%")).toHaveClass("font-semibold");
  });
});
