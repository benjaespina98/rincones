import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WineRowPanel from "../src/components/WineRowPanel";

/**
 * El panel que se abre bajo una fila de Mi Bodega. Favorito y Eliminar llevan texto visible
 * (un tacho solo no dice qué borra) y Favorito es un toggle con `aria-pressed`.
 */
afterEach(cleanup);

const VINO = { _id: "v1", name: "Malbec", quantity: 3, favorite: false, varietal: "Malbec" };

const montar = (wine = VINO, props = {}) => {
  const h = {
    onToggleTasted: vi.fn(),
    onToggleFavorite: vi.fn(),
    onEliminar: vi.fn(),
  };
  const utils = render(
    <WineRowPanel wine={wine} vista="stock" isPending={false} nuncaFueTuyo={false} enCava="" {...h} {...props} />
  );
  return { ...h, ...utils };
};

describe("WineRowPanel", () => {
  it("Eliminar llama a onEliminar con el id", () => {
    const { onEliminar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onEliminar).toHaveBeenCalledTimes(1);
    expect(onEliminar).toHaveBeenCalledWith("v1");
  });

  it("Favorito llama a onToggleFavorite con el vino y expone aria-pressed", () => {
    const { onToggleFavorite, rerender } = montar();
    const boton = screen.getByRole("button", { name: "Favorito" });
    expect(boton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(boton);
    expect(onToggleFavorite).toHaveBeenCalledWith(VINO);
    rerender(
      <WineRowPanel
        wine={{ ...VINO, favorite: true }}
        vista="stock"
        isPending={false}
        nuncaFueTuyo={false}
        enCava=""
        onToggleTasted={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onEliminar={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Favorito" })).toHaveAttribute("aria-pressed", "true");
  });

  it("con o sin stock quedan sólo Favorito y Eliminar: el stock vive en el stepper de la fila", () => {
    montar();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
  });

  it("sin stock quedan sólo Favorito y Eliminar (son sólo ícono, con su nombre accesible)", () => {
    montar({ ...VINO, quantity: 0 });
    const nombres = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(nombres).toEqual(["Favorito", "Eliminar"]);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
  });

  it("es una sola fila: una línea de resumen y las acciones, sin la ficha en grilla", () => {
    const { container } = montar({ ...VINO, varietal: "Malbec", vintage: 2019, region: "Valle de Uco" });
    expect(container.querySelector(".wine-row__facts")).toBeNull();
    expect(container.querySelector(".wine-row__resumen")?.textContent).toMatch(/Malbec · 2019 · Valle de Uco/);
    expect(container.querySelectorAll(".wine-row__acciones").length).toBe(1);
  });

  it("no repite lo del stepper: ni \"Abrí una botella\", ni \"Sumar botellas\", ni \"Tengo stock de nuevo\"", () => {
    montar({ ...VINO, quantity: 2 });
    expect(screen.queryByRole("button", { name: /abrí una botella|sumar botellas|tengo stock/i })).toBeNull();
  });

  it("con conToggleProbado ofrece marcar/desmarcar probado (cuando el chip no está en la fila)", () => {
    const { onToggleTasted } = montar({ ...VINO, tasted: true }, { conToggleProbado: true });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como sin probar" }));
    expect(onToggleTasted).toHaveBeenCalledTimes(1);
  });

  it("no repite el tipo del vino (ya está en la etiqueta de la fila)", () => {
    montar({ ...VINO, type: "red" });
    expect(screen.queryByText("Tipo")).toBeNull();
  });

  it("pendiente: los botones no hacen nada", () => {
    const { onEliminar, onToggleFavorite } = montar(VINO, { isPending: true });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Favorito" }));
    expect(onEliminar).not.toHaveBeenCalled();
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });
});
