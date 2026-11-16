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
  it("en Ya tomados dice cuántas veces lo tomaste, sin renglón explicativo de los botones", () => {
    const { container } = render(<WineRow {...props} />);
    expect(container.querySelector(".wine-row__tomado").textContent).toBe("Tomado 2 veces · hoy");
    expect(container.querySelector(".wine-row__pista")).toBeNull();
  });

  it("con botellas tampoco hay un renglón que explique el −", () => {
    const { container } = render(<WineRow {...props} wine={{ ...TOMADO, quantity: 2 }} />);
    expect(container.querySelector(".wine-row__pista")).toBeNull();
  });

  it("«Tomado» también se ve en En stock", () => {
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

describe("WineRow en «Sin stock»: lo que no tenía lugar sigue siendo operable", () => {
  const SIN_LUGAR = { ...TOMADO, tasted: false, consumptionCount: 0, lastConsumedAt: undefined, quantity: 0 };

  it("la fila se puede desplegar (marcar como probado, favorito, eliminar)", () => {
    const { container } = render(<WineRow {...props} vista="sin-stock" wine={SIN_LUGAR} expanded />);
    expect(container.querySelector(".wine-row__expand")).not.toBeNull();
    expect(container.querySelector(".wine-row__pista")).toBeNull();
    expect(container.querySelector('[aria-label="Marcar como ya probado"]')).not.toBeNull();
  });

  it("en una vista que no es de archivo, un vino sin stock desplegado no abre el panel (como antes)", () => {
    const { container } = render(<WineRow {...props} vista="otra" wine={SIN_LUGAR} expanded />);
    expect(container.querySelector(".wine-row__expand")).toBeNull();
  });
});
