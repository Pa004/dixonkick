import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ConfidenceBadge from "./ConfidenceBadge";

describe("ConfidenceBadge", () => {
  it.each([
    ["seguro", "Seguro"],
    ["probable", "Probable"],
    ["ajustado", "Ajustado"],
    ["incierto", "Incierto"],
  ] as const)("muestra la etiqueta y el porcentaje para %s", (_level, label) => {
    render(<ConfidenceBadge confidence={{ level: _level, label, probability: 0.57 }} />);
    expect(screen.getByText((content) => content.includes(label))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("57%"))).toBeInTheDocument();
  });
});
