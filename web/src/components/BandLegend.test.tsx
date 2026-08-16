import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BandLegend from "./BandLegend";

describe("BandLegend", () => {
  it("explica las cuatro bandas de confianza", () => {
    render(<BandLegend />);
    const list = screen.getByRole("list", { name: /bandas de confianza/i });
    expect(list).toBeInTheDocument();
    for (const label of ["Seguro", "Probable", "Ajustado", "Incierto"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});