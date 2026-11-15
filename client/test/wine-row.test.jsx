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
    expect(screen.getByRole("button", { name: /como tomado/i })).toBeTruthy();

    rerender(<WineRow {...base} vista="probados" />);
    expect(screen.queryByRole("button", { name: /como tomado/i })).toBeNull();
  });

  it("sin stock no se ofrece abrir una botella", () => {
    render(<WineRow {...base} wine={{ ...VINO, quantity: 0 }} expanded />);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
  });

  it("el panel sólo existe cuando la fila está abierta", () => {
    const { rerender } = render(<WineRow {...base} />);
    expect(screen.queryByRole("button", { name: "Favorito" })).toBeNull();

    rerender(<WineRow {...base} expanded />);
    expect(screen.getByRole("button", { name: "Favorito" })).toBeTruthy();
  });

  it("en grilla no se despliega: ahí el corazón es el que se puede tocar", () => {
    render(<WineRow {...base} esGrilla expanded />);
    expect(screen.queryByText(/Abrí una botella/)).toBeNull();
    expect(screen.getByRole("button", { name: /como favorito/i })).toBeTruthy();
  });
});

/**
 * El gesto de deslizar. Lo que se cuida acá no es la animación —eso se mira—
 * sino las tres reglas que lo hacen usable y que se rompen sin hacer ruido:
 * que no le robe el gesto al scroll, que revelar no sea ejecutar, y que la
 * fila abierta no te mande a otra pantalla con el toque siguiente.
 */
describe("deslizar para llegar a las acciones", () => {
  beforeEach(() => displaySpy.mockClear());

  const deslizar = (head, { dx, dy = 0 }) => {
    fireEvent.pointerDown(head, { clientX: 300, clientY: 100, pointerType: "touch", pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: 300 + dx / 3, clientY: 100 + dy / 3, pointerType: "touch", pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: 300 + dx, clientY: 100 + dy, pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(head, { clientX: 300 + dx, clientY: 100 + dy, pointerType: "touch", pointerId: 1 });
  };

  const cabecera = (c) => c.querySelector(".wine-row__head");
  const capa = (c) => c.querySelector(".wine-row__swipe");

  it("arrastrar a la izquierda deja las acciones a la vista", () => {
    const { container } = render(<WineRow {...base} />);
    expect(capa(container).getAttribute("inert")).not.toBeNull();

    deslizar(cabecera(container), { dx: -90 });

    expect(cabecera(container).style.transform).toBe("translateX(-112px)");
    expect(capa(container).getAttribute("inert")).toBeNull();
  });

  it("un gesto que arranca vertical es scroll y no toca la fila", () => {
    // Sin este candado, cada scroll con el pulgar torcido abría media docena
    // de filas al pasar.
    const { container } = render(<WineRow {...base} />);

    deslizar(cabecera(container), { dx: -90, dy: -140 });

    expect(cabecera(container).style.transform).toBe("");
  });

  it("un arrastre corto vuelve solo", () => {
    const { container } = render(<WineRow {...base} />);

    deslizar(cabecera(container), { dx: -20 });

    expect(cabecera(container).style.transform).toBe("");
  });

  it("revelar no borra: el tacho sigue pidiendo confirmación", () => {
    const onEliminar = vi.fn();
    const { container } = render(<WineRow {...base} onEliminar={onEliminar} />);

    deslizar(cabecera(container), { dx: -90 });
    // El gesto solo no llama a nadie.
    expect(onEliminar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Eliminar/ }));
    expect(onEliminar).toHaveBeenCalledWith(VINO._id);
  });

  it("con las acciones a la vista, el toque las guarda en vez de abrir la ficha", () => {
    const onAbrirFicha = vi.fn();
    const { container } = render(<WineRow {...base} onAbrirFicha={onAbrirFicha} />);

    deslizar(cabecera(container), { dx: -90 });
    fireEvent.click(container.querySelector(".wine-row__main"));

    expect(onAbrirFicha).not.toHaveBeenCalled();
    expect(cabecera(container).style.transform).toBe("");
  });

  it("en grilla no hay gesto: correr una celda descoloca a las vecinas", () => {
    const { container } = render(<WineRow {...base} esGrilla />);
    expect(capa(container)).toBeNull();
  });

  it("con el mouse tampoco: en escritorio hay hover y no hace falta esconder nada", () => {
    const { container } = render(<WineRow {...base} />);

    fireEvent.pointerDown(cabecera(container), { clientX: 300, clientY: 100, pointerType: "mouse" });
    fireEvent.pointerMove(cabecera(container), { clientX: 200, clientY: 100, pointerType: "mouse" });
    fireEvent.pointerUp(cabecera(container), { clientX: 200, clientY: 100, pointerType: "mouse" });

    expect(cabecera(container).style.transform).toBe("");
  });
});
