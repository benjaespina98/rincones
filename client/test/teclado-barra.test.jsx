import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useKeyboardInset } from "../src/hooks/useKeyboardInset";

/**
 * Mientras se escribe en un campo de texto la barra de pestañas se esconde: el hook marca
 * <html data-teclado="abierto"> y el CSS hace el resto.
 */
function Pantalla() {
  useKeyboardInset();
  return (
    <div>
      <textarea aria-label="pregunta" />
      <input type="checkbox" aria-label="casilla" />
      <button type="button">botón</button>
    </div>
  );
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  cleanup();
});

describe("useKeyboardInset: barra escondida con el teclado", () => {
  it("al enfocar un campo de texto marca el teclado abierto, y al salir lo saca", async () => {
    const { getByLabelText, getByText } = render(<Pantalla />);
    expect(document.documentElement.dataset.teclado).toBeUndefined();
    act(() => getByLabelText("pregunta").focus());
    expect(document.documentElement.dataset.teclado).toBe("abierto");
    act(() => getByText("botón").focus());
    await act(async () => {
      await esperar(200);
    });
    expect(document.documentElement.dataset.teclado).toBeUndefined();
  });

  it("una casilla o un botón no abren el teclado", () => {
    const { getByLabelText, getByText } = render(<Pantalla />);
    act(() => getByLabelText("casilla").focus());
    expect(document.documentElement.dataset.teclado).toBeUndefined();
    act(() => getByText("botón").focus());
    expect(document.documentElement.dataset.teclado).toBeUndefined();
  });

  it("al desmontar no deja la marca puesta", () => {
    const { getByLabelText, unmount } = render(<Pantalla />);
    act(() => getByLabelText("pregunta").focus());
    unmount();
    expect(document.documentElement.dataset.teclado).toBeUndefined();
  });
});
