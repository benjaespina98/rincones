import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import FilaDeAtajos from "../src/components/FilaDeAtajos";

/**
 * Una fila de atajos que se renueva sola, de a uno. Lo que se prueba es el
 * COMPORTAMIENTO que la hace tolerable: cambia de a uno, despacio, y NUNCA
 * mientras la persona la está usando ni cuando pidió que nada se mueva solo.
 */
const CADA = 1000;
const SALIDA = 240;

const inicial = [{ label: "A" }, { label: "B" }, { label: "C" }];

let contador;
const siguiente = () => ({ label: `N${(contador += 1)}` });

const montar = (props = {}) =>
  render(
    <FilaDeAtajos
      inicial={inicial}
      siguiente={siguiente}
      cada={CADA}
      renderItem={(it, { saliendo }) => (
        <button type="button" data-saliendo={saliendo ? "si" : "no"}>
          {it.label}
        </button>
      )}
      {...props}
    />
  );

const textos = () => screen.getAllByRole("button").map((b) => b.textContent);
const avanzar = (ms) => act(() => vi.advanceTimersByTime(ms));
/** Un ciclo completo: la espera, la salida y el reemplazo. */
const unCiclo = () => avanzar(CADA + SALIDA + 5);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0); // sin jitter: la espera es exacta
  contador = 0;
  delete window.matchMedia;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FilaDeAtajos", () => {
  it("al montar muestra los iniciales, en orden", () => {
    montar();
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("cada tanto cambia UNO solo; los demás quedan donde estaban", () => {
    montar();
    unCiclo();
    expect(textos()).toEqual(["N1", "B", "C"]);
  });

  it("rota en round-robin: el segundo ciclo cambia el siguiente, no el mismo", () => {
    montar();
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["N1", "N2", "C"]);
    unCiclo();
    expect(textos()).toEqual(["N1", "N2", "N3"]);
    unCiclo();
    expect(textos()).toEqual(["N4", "N2", "N3"]);
  });

  it("durante la salida el atajo se marca como 'saliendo' y recién después se reemplaza", () => {
    montar();
    avanzar(CADA + 10);
    const botones = screen.getAllByRole("button");
    expect(botones[0]).toHaveAttribute("data-saliendo", "si");
    expect(botones[0].textContent).toBe("A");
    avanzar(SALIDA);
    expect(textos()[0]).toBe("N1");
    expect(screen.getAllByRole("button")[0]).toHaveAttribute("data-saliendo", "no");
  });

  it("los atajos fijos no rotan nunca", () => {
    montar({ inicial: [{ label: "FIJO", fijo: true }, { label: "B" }, { label: "C" }] });
    unCiclo();
    unCiclo();
    unCiclo();
    unCiclo();
    expect(textos()[0]).toBe("FIJO");
  });

  it("si todos son fijos, no hay nada que rotar", () => {
    montar({ inicial: [{ label: "X", fijo: true }, { label: "Y", fijo: true }] });
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["X", "Y"]);
  });

  it("si 'siguiente' no devuelve nada, la fila queda como estaba", () => {
    montar({ siguiente: () => null });
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("'pausado' la frena (por ejemplo, mientras se escribe)", () => {
    montar({ pausado: true });
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("mientras el puntero está encima no cambia nada", () => {
    const { container } = montar();
    fireEvent.pointerEnter(container.firstChild);
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("al sacar el puntero espera diez segundos antes de volver a cambiar", () => {
    const { container } = montar();
    fireEvent.pointerEnter(container.firstChild);
    fireEvent.pointerLeave(container.firstChild);
    avanzar(5000);
    expect(textos()).toEqual(["A", "B", "C"]);
    avanzar(6000);
    expect(textos()).not.toEqual(["A", "B", "C"]);
  });

  it("después de un toque en la fila se queda quieta diez segundos", () => {
    const { container } = montar();
    fireEvent.pointerDown(container.firstChild);
    avanzar(9000);
    expect(textos()).toEqual(["A", "B", "C"]);
    avanzar(2000);
    expect(textos()).not.toEqual(["A", "B", "C"]);
  });

  it("con el foco adentro (teclado) tampoco cambia", () => {
    montar();
    act(() => screen.getAllByRole("button")[1].focus());
    avanzar(9000);
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("con la pestaña oculta no rota, y retoma cuando vuelve", () => {
    montar();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["A", "B", "C"]);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    unCiclo();
    expect(textos()).not.toEqual(["A", "B", "C"]);
  });

  it("con prefers-reduced-motion nada se mueve solo", () => {
    window.matchMedia = () => ({ matches: true });
    montar();
    unCiclo();
    unCiclo();
    unCiclo();
    expect(textos()).toEqual(["A", "B", "C"]);
  });

  it("al desmontar limpia los temporizadores: no queda nada corriendo", () => {
    const { unmount } = montar();
    unmount();
    expect(() => unCiclo()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("un atajo que reemplaza entra sin esperar a los demás (entra = 0)", () => {
    const entras = [];
    montar({
      renderItem: (it, { entra }) => {
        entras.push([it.label, entra]);
        return <button type="button">{it.label}</button>;
      },
    });
    unCiclo();
    // Al montar: orden 0, 1, 2. El que reemplaza al primero entra con 0.
    expect(entras.filter(([l]) => l === "N1")[0][1]).toBe(0);
    expect(entras.filter(([l]) => l === "C")[0][1]).toBe(2);
  });
});
