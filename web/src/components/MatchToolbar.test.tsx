import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MatchToolbar from "./MatchToolbar";

describe("MatchToolbar", () => {
  it("ofrece las dos opciones de orden", async () => {
    render(<MatchToolbar sort="date" onSort={() => {}} onlyPredicted={false} onOnlyPredicted={() => {}} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar partidos" }));
    expect(await screen.findByRole("option", { name: "Ordenar por fecha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ordenar por confianza" })).toBeInTheDocument();
  });

  it("notifica al cambiar el orden", async () => {
    const onSort = vi.fn();
    render(<MatchToolbar sort="date" onSort={onSort} onlyPredicted={false} onOnlyPredicted={() => {}} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar partidos" }));
    const option = await screen.findByRole("option", { name: "Ordenar por confianza" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(onSort).toHaveBeenCalledWith("confidence");
  });

  it("alterna el filtro de solo predicción", () => {
    const onOnly = vi.fn();
    render(<MatchToolbar sort="date" onSort={() => {}} onlyPredicted={false} onOnlyPredicted={onOnly} />);
    const checkbox = screen.getByRole("checkbox", { name: /Solo con predicción/ });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox);
    expect(onOnly).toHaveBeenCalledWith(true);
  });
});