import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

const { default: WineRow } = await import("../src/components/WineRow");

/**
 * Lo reportado: un vino tomado al que le sumabas una botella y se la abrías
 * quedaba EXACTAMENTE igual en la lista. El historial avanzaba en el servidor y
 * la fila no lo decía. Estos tests fijan que ahora lo dice, y dónde no.
 */
const hoy = new Date().toISOString();
const TOMADO = {
  _id: "1",
  name: "Catena Alta",
  winery: "Catena Zapata",
  varietal: "Malbec",
  type: "red",
  quantity: 0,
  tasted: true,
  consumptionCount: 2,
  lastConsumedAt: hoy,
  favorite: false,
};

const props = {
  wine: TOMADO,
  vista: "probados",
  esGrilla: false,
  enFavoritos: false,
  modoSeleccion: false,
  elegido: false,
  expanded: false,
  isPending: false,
  onAbrirFicha: () => {},
  onSeleccionar: () => {},
  onToggleTasted: () => {},
  onToggleFavorite: () => {},
  onExpandir: () => {},
  onAbrirBotella: () => {},
  onEliminar: () => {},
  onSumarUna: () => {},
  onAbrirUna: () => {},
  onSumarStock: () => {},
};

describe("WineRow: lo que pasó con el vino", () => {
  it("en Ya tomados dice cuántas veces lo tomaste y qué hace cada botón", () => {
    const { container } = render(<WineRow {...props} />);
    expect(container.querySelector(".wine-row__tomado").textContent).toBe("Tomado 2 veces · hoy");
    expect(container.querySelector(".wine-row__pista").textContent).toBe("Sin botellas · tocá + para sumar una al stock");
  });

  it("con botellas, la pista dice cuántas hay y qué hace el −", () => {
    const { container } = render(<WineRow {...props} wine={{ ...TOMADO, quantity: 2 }} />);
    expect(container.querySelector(".wine-row__pista").textContent).toBe("2 botellas en tu bodega · tocá − para abrir una");
  });

  it("la pista sólo está en Ya tomados; «Tomado» también se ve en En stock", () => {
    const { container } = render(<WineRow {...props} vista="instock" wine={{ ...TOMADO, quantity: 2 }} />);
    expect(container.querySelector(".wine-row__pista")).toBeNull();
    expect(container.querySelector(".wine-row__tomado").textContent).toBe("Tomado 2 veces · hoy");
  });

  it("en la grilla no aparece ninguno de los dos renglones", () => {
    const { container } = render(<WineRow {...props} esGrilla />);
    expect(container.querySelector(".wine-row__tomado")).toBeNull();
    expect(container.querySelector(".wine-row__pista")).toBeNull();
  });

  it("un vino sin tomar no dice «Tomado» aunque tenga un contador viejo", () => {
    const { container } = render(<WineRow {...props} vista="instock" wine={{ ...TOMADO, quantity: 2, tasted: false }} />);
    expect(container.querySelector(".wine-row__tomado")).toBeNull();
  });
});
