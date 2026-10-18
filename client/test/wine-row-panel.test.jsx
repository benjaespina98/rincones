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
    onAbrirBotella: vi.fn(),
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
        onAbrirBotella={vi.fn()}
        onToggleTasted={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onEliminar={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Favorito" })).toHaveAttribute("aria-pressed", "true");
  });

  it("con stock ofrece abrir una botella además de Favorito y Eliminar", () => {
    montar();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText(/Abrí una botella/)).toBeInTheDocument();
  });

  it("sin stock quedan sólo Favorito y Eliminar", () => {
    montar({ ...VINO, quantity: 0 });
    const nombres = screen.getAllByRole("button").map((b) => b.textContent.trim());
    expect(nombres).toEqual(["Favorito", "Eliminar"]);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
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
