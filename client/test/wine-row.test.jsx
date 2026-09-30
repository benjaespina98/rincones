import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";

/**
 * La fila de Mi Bodega salió de un `.map()` adentro de una página de 1910
 * líneas. El motivo del cambio no es el orden: es que cualquier cosa que
 * cambiara en esa pantalla —una letra en el buscador, abrir el sheet de
 * filtros— reconstruía el JSX de las treinta filas visibles.
 *
 * Estos tests cuidan lo único que hace que eso siga siendo cierto, que es
 * frágil y que no se ve: la fila está memoizada Y quien la usa le pasa
 * funciones estables. Cualquiera de las dos que se rompa devuelve la pantalla
 * al estado anterior sin que nada falle ni se note al mirarla.
 *
 * Se cuentan renders espiando `wineDisplayName`, que la fila llama al pintarse.
 */
const displaySpy = vi.fn((wine) => wine?.name || "");
vi.mock("../src/utils/wineIdentity", () => ({
  wineDisplayName: (wine) => displaySpy(wine),
}));

const { default: WineRow } = await import("../src/components/WineRow");

const VINO = {
  _id: "1",
  name: "Catena Alta",
  winery: "Catena Zapata",
  varietal: "Malbec",
  region: "Luján de Cuyo, Mendoza",
  vintage: 2019,
  type: "red",
  quantity: 3,
  rating: 4,
  tasted: false,
  favorite: false,
};

/** Las props que no cambian entre un render y el siguiente. */
const base = {
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

/**
 * Un padre que se re-renderiza solo, como hace BodyPage con cada tecla del
 * buscador. `estables` decide si le pasa a la fila las mismas funciones o unas
 * nuevas en cada vuelta — que es exactamente la diferencia entre `useCallback`
 * y una flecha escrita en el JSX.
 */
function Padre({ estables }) {
  const [n, setN] = useState(0);
  const acciones = estables
    ? {}
    : { onToggleTasted: () => {}, onToggleFavorite: () => {}, onAbrirFicha: () => {} };
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>
        repintar {n}
      </button>
      <WineRow {...base} {...acciones} />
    </>
  );
}

const renders = () => displaySpy.mock.calls.length;

describe("la fila no se repinta si no cambió", () => {
  beforeEach(() => displaySpy.mockClear());

  it("el padre se repinta y la fila no", () => {
    render(<Padre estables />);
    const antes = renders();
    expect(antes).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /repintar/ }));
    fireEvent.click(screen.getByRole("button", { name: /repintar/ }));

    // Dos repintados del padre, cero trabajo de la fila.
    expect(renders()).toBe(antes);
  });

  it("una función nueva en cada render rompe la memoización", () => {
    // Este test no describe lo que queremos: describe lo que pasa si alguien
    // escribe `onClick={() => hacer(wine)}` en BodyPage. Falla en silencio —la
    // app anda igual— y por eso conviene tenerlo escrito.
    render(<Padre estables={false} />);
    const antes = renders();

    fireEvent.click(screen.getByRole("button", { name: /repintar/ }));

    expect(renders()).toBeGreaterThan(antes);
  });

  it("cuando el vino sí cambia, la fila se repinta", () => {
    const { rerender } = render(<WineRow {...base} />);
    const antes = renders();

    rerender(<WineRow {...base} wine={{ ...VINO, tasted: true }} />);

    expect(renders()).toBeGreaterThan(antes);
  });
});

describe("lo que la fila muestra según la vista", () => {
  beforeEach(() => displaySpy.mockClear());

  it("en Probados no hay chip de probado: sería una columna repitiendo la misma palabra", () => {
    const { rerender } = render(<WineRow {...base} vista="instock" />);
    expect(screen.getByRole("button", { name: /como probado/i })).toBeTruthy();

    rerender(<WineRow {...base} vista="probados" />);
    expect(screen.queryByRole("button", { name: /como probado/i })).toBeNull();
  });

  it("sin stock no se ofrece abrir una botella", () => {
    render(<WineRow {...base} wine={{ ...VINO, quantity: 0 }} expanded />);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
  });

  it("el panel sólo existe cuando la fila está abierta", () => {
    const { rerender } = render(<WineRow {...base} />);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();

    rerender(<WineRow {...base} expanded />);
    expect(screen.getByText(/Abrí una botella/)).toBeTruthy();
  });

  it("en grilla no se despliega: ahí el corazón es el que se puede tocar", () => {
    render(<WineRow {...base} esGrilla expanded />);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
    expect(screen.getByRole("button", { name: /como favorito/i })).toBeTruthy();
  });
});
