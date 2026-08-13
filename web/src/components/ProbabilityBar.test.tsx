import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProbabilityBar from "./ProbabilityBar";

describe("ProbabilityBar", () => {
  it("expone las probabilidades en un aria-label accesible", () => {
    render(<ProbabilityBar home={0.5} draw={0.3} away={0.2} />);
    const bar = screen.getByRole("img");
    expect(bar).toHaveAttribute("aria-label", "Probabilidades — Local 50%, Empate 30%, Visita 20%");
  });

  it("dibuja un segmento por resultado", () => {
    render(<ProbabilityBar home={0.6} draw={0.25} away={0.15} />);
    const segments = screen.getByRole("img").children;
    expect(segments).toHaveLength(3);
  });
});