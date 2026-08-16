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
    homeLogo: null,
    awayLogo: null,
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

  it("muestra el marcador final cuando el partido terminó", () => {
    render(
      <MatchCard fixture={{ ...baseFixture(), status: "post", homeScore: 2, awayScore: 1 }} />,
    );
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
    expect(screen.getByText("2-1")).toBeInTheDocument();
  });

  it("muestra el marcador en vivo durante el partido", () => {
    render(<MatchCard fixture={{ ...baseFixture(), status: "in", homeScore: 1, awayScore: 0 }} />);
    expect(screen.getByText("En vivo")).toBeInTheDocument();
    expect(screen.getByText("1-0")).toBeInTheDocument();
  });

  it("no muestra la predicción cuando el partido ya terminó", () => {
    render(
      <MatchCard
        fixture={{
          ...baseFixture(),
          status: "post",
          homeScore: 0,
          awayScore: 0,
          prediction: {
            probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
            scoreline: { home: 1, away: 0, probability: 0.2 },
            over_25: 0.4,
            under_25: 0.6,
            btts_yes: 0.5,
            btts_no: 0.5,
            expected_goals: { home: 1.2, away: 0.8 },
            pick: "H",
            confidence: { level: "ajustado", label: "Ajustado", probability: 0.5 },
          },
        }}
      />,
    );
    expect(screen.queryByText(/Favorito:/)).not.toBeInTheDocument();
  });
});
