import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const { default: WineRow } = await import("../src/components/WineRow");

/**
 * El stepper de cada fila ("− ×2 +"): sumar una botella, o abrir una, sin desplegar la fila.
 * El "−" ABRE una botella (descuenta y deja el vino probado, con Deshacer): no es una corrección de
 * inventario.
 */
afterEach(cleanup);

const VINO = { _id: "1", name: "Trumpeter", winery: "Rutini", varietal: "Malbec", type: "red", quantity: 2, tasted: false, favorite: false };

const montar = (extra = {}, wine = VINO) => {
  const h = { onSumarUna: vi.fn(), onAbrirUna: vi.fn() };
  const props = {
    wine,
    vista: "probados",
    esGrilla: false,
    enFavoritos: false,
    modoSeleccion: false,
    elegido: false,
    expanded: false,
    isPending: false,
    onAbrirFicha: vi.fn(),
    onSeleccionar: vi.fn(),
    onToggleTasted: vi.fn(),
    onToggleFavorite: vi.fn(),
    onExpandir: vi.fn(),
    onAbrirBotella: vi.fn(),
    onEliminar: vi.fn(),
    ...h,
    ...extra,
  };
  return { ...h, ...render(<WineRow {...props} />) };
};

describe("WineRow: stepper junto a la cantidad", () => {
  it("sumar una y abrir una llaman a su handler con el vino, sin abrir la ficha", () => {
    const onAbrirFicha = vi.fn();
    const { onSumarUna, onAbrirUna } = montar({ onAbrirFicha });
    fireEvent.click(screen.getByRole("button", { name: "Sumar una botella" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomé una botella" }));
    expect(onSumarUna).toHaveBeenCalledWith(VINO);
    expect(onAbrirUna).toHaveBeenCalledWith(VINO);
    expect(onAbrirFicha).not.toHaveBeenCalled();
  });

  it("sin stock sólo hay '+': no hay nada que abrir", () => {
    montar({}, { ...VINO, quantity: 0 });
    expect(screen.getByRole("button", { name: "Sumar una botella" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tomé una botella" })).toBeNull();
  });

  it("no aparece en grilla, mientras se selecciona, ni sin el handler", () => {
    montar({ esGrilla: true });
    expect(screen.queryByRole("button", { name: "Sumar una botella" })).toBeNull();
    cleanup();
    montar({ modoSeleccion: true });
    expect(screen.queryByRole("button", { name: "Sumar una botella" })).toBeNull();
    cleanup();
    montar({ onSumarUna: undefined });
    expect(screen.queryByRole("button", { name: "Sumar una botella" })).toBeNull();
  });

  it("con una acción en vuelo los botones se apagan", () => {
    montar({ isPending: true });
    expect(screen.getByRole("button", { name: "Sumar una botella" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tomé una botella" })).toBeDisabled();
  });

  it("el chip de probado dice 'Ya lo probé' / 'Marcar como probado'", () => {
    const { rerender } = montar({ vista: "instock" });
    expect(screen.getByText("Marcar como probado")).toBeInTheDocument();
    rerender(<WineRow wine={{ ...VINO, tasted: true }} vista="instock" esGrilla={false} enFavoritos={false} modoSeleccion={false} elegido={false} expanded={false} isPending={false} onAbrirFicha={() => {}} onSeleccionar={() => {}} onToggleTasted={() => {}} onToggleFavorite={() => {}} onExpandir={() => {}} onAbrirBotella={() => {}} onEliminar={() => {}} />);
    expect(screen.getByText("Ya lo probé")).toBeInTheDocument();
  });
});
