import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchCard from "./MatchCard";
import type { Fixture } from "../api";

function baseFixture(): Fixture {
  return {
    id: "fx-1",
    league: "E0",
    date: "2026-08-13T18:00Z",
    home: "Arsenal",
    away: "Coventry City",
    homeShort: "ARS",
    awayShort: "COV",
    status: "pre",
    homeScore: null,
    awayScore: null,
    prediction: null,
    predictedAt: null,
    skipReason: null,
  };
}

describe("MatchCard", () => {
  it.each([
    ["no_model", "Liga sin modelo de datos todavía"],
    ["team_not_in_model", "Equipo sin datos en el modelo"],
    ["predict_failed", "Predicción falló; se reintentará en el próximo sync"],
  ] as const)("explica el motivo %s", (skipReason, label) => {
    render(<MatchCard fixture={{ ...baseFixture(), skipReason }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("usa el mensaje genérico cuando no hay motivo registrado", () => {
    render(<MatchCard fixture={baseFixture()} />);
    expect(screen.getByText("Sin datos suficientes para predecir este duelo")).toBeInTheDocument();
  });
});
