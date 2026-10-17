import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";

const { default: WineRow } = await import("../src/components/WineRow");

/**
 * La fila le pide a `WinePhoto` cómo ajustar la foto según la vista:
 *   · vitrina (En stock, con botellas) → fit="auto": llena el marco y sólo se
 *     muestra entera una botella de catálogo muy angosta;
 *   · el resto (archivo, grilla) → "cover" fijo, aunque la imagen sea angosta.
 * Este test fija esa decisión, que es lo único de WineRow que no estaba cubierto.
 */
const VINO = {
  _id: "1",
  name: "Catena Alta",
  winery: "Catena Zapata",
  varietal: "Malbec",
  type: "red",
  quantity: 3,
  tasted: false,
  favorite: false,
  image: "https://res.cloudinary.com/x/image/upload/a.jpg",
};

const props = {
  wine: VINO,
  vista: "instock",
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
};

const cargar = (container, ancho, alto) => {
  const img = container.querySelector("img");
  Object.defineProperty(img, "naturalWidth", { value: ancho, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: alto, configurable: true });
  fireEvent.load(img);
};

describe("WineRow: ajuste de la foto por vista", () => {
  it("vitrina: una botella angosta (1:3) se muestra entera", () => {
    const { container } = render(<WineRow {...props} />);
    cargar(container, 300, 900);
    expect(container.querySelector(".wine-photo")).toHaveClass("wine-photo--contain");
  });

  it("vitrina: una foto normal (4:3) llena el marco", () => {
    const { container } = render(<WineRow {...props} />);
    cargar(container, 1200, 900);
    expect(container.querySelector(".wine-photo")).toHaveClass("wine-photo--cover");
  });

  it("archivo (Ya tomados): cover fijo aunque la imagen sea angosta", () => {
    const { container } = render(<WineRow {...props} vista="probados" />);
    cargar(container, 300, 900);
    expect(container.querySelector(".wine-photo")).toHaveClass("wine-photo--cover");
  });

  it("grilla en stock: también usa auto, porque la vitrina incluye la grilla", () => {
    const { container } = render(<WineRow {...props} esGrilla />);
    cargar(container, 300, 900);
    // En grilla `esVitrina` sigue siendo verdadero (instock con stock): usa "auto".
    expect(container.querySelector(".wine-photo")).toHaveClass("wine-photo--contain");
  });
});
