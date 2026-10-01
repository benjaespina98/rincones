import { describe, it, expect, vi, afterEach } from "vitest";
import { irHasta } from "../src/utils/scroll";

/**
 * "Reducir movimiento" no es "más corto": es NO.
 *
 * El CSS de la app apaga todas las animaciones bajo la preferencia, pero hay un
 * agujero que no puede tapar: un `scrollIntoView({ behavior: "smooth" })`
 * escrito en JavaScript gana sobre cualquier regla de hoja de estilos. La app
 * tenía tres lugares así —la barra de secciones de la ficha, el hilo del
 * Sommelier y el salto al diario— donde quien activó la preferencia igual se
 * comía media pantalla deslizándose.
 *
 * Este test existe para que el próximo `scrollIntoView` no lo reabra.
 */

const conPreferencia = (reduce) => {
  window.matchMedia = vi.fn().mockImplementation((consulta) => ({
    matches: consulta.includes("prefers-reduced-motion") ? reduce : false,
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

afterEach(() => vi.restoreAllMocks());

describe("irHasta", () => {
  it("con la preferencia activada, salta sin animar", () => {
    conPreferencia(true);
    const el = { scrollIntoView: vi.fn() };

    irHasta(el, { block: "start" });

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("sin la preferencia, se desliza", () => {
    conPreferencia(false);
    const el = { scrollIntoView: vi.fn() };

    irHasta(el, { block: "end" });

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
  });

  it("un `behavior` pasado por quien llama no puede pisar la preferencia", () => {
    // Es el punto de tener una función: que no se pueda pedir "smooth" y que
    // salga "smooth" a pesar de la preferencia.
    conPreferencia(true);
    const el = { scrollIntoView: vi.fn() };

    irHasta(el, { behavior: "smooth" });

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" });
  });

  it("sin elemento no explota", () => {
    conPreferencia(false);
    expect(() => irHasta(null)).not.toThrow();
    expect(() => irHasta(undefined)).not.toThrow();
    expect(() => irHasta({})).not.toThrow();
  });
});
