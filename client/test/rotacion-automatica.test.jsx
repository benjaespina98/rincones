import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useRotacionAutomatica from "../src/hooks/useRotacionAutomatica";

/**
 * La recomendación de Descubrí se renueva sola, pero NUNCA mientras alguien la usa.
 * Lo que se prueba es cuándo rota y cuándo se frena, no cuánto tarda exactamente (lleva azar).
 */
const TOPE = 9000 * 1.4 + 50;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.useRealTimers();
});

const montar = (props = {}) => {
  const alRotar = vi.fn();
  const hook = renderHook((p) => useRotacionAutomatica({ activo: true, alRotar, ...p }), { initialProps: props });
  return { alRotar, ...hook };
};

describe("rotación automática", () => {
  it("rota sola, pasado el intervalo", () => {
    const { alRotar } = montar();
    act(() => vi.advanceTimersByTime(TOPE));
    expect(alRotar).toHaveBeenCalledTimes(1);
  });

  it("sigue rotando de a poco, no una sola vez", () => {
    const { alRotar } = montar();
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("no rota si no está activa (buscando, cargando, un solo vino)", () => {
    const { alRotar } = montar({ activo: false });
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar).not.toHaveBeenCalled();
  });

  it("no rota con 'reducir movimiento'", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { alRotar } = montar();
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar).not.toHaveBeenCalled();
  });

  it("no rota con el mouse encima", () => {
    const { alRotar, result } = montar();
    act(() => result.current.onPointerEnter());
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar).not.toHaveBeenCalled();

    act(() => result.current.onPointerLeave());
    // Recién soltada, todavía se espera: la pausa tras tocar dura diez segundos.
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar).toHaveBeenCalled();
  });

  it("después de un toque espera diez segundos antes de volver a rotar", () => {
    const { alRotar, result } = montar();
    act(() => vi.advanceTimersByTime(8000));
    act(() => result.current.onPointerDown());
    // El intervalo vence, pero el toque fue hace menos de 10 s: se salta esa vuelta.
    act(() => vi.advanceTimersByTime(TOPE - 8000));
    expect(alRotar).not.toHaveBeenCalled();
  });

  it("no rota con la pestaña oculta", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const { alRotar } = montar();
    act(() => vi.advanceTimersByTime(TOPE * 3));
    expect(alRotar).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
});
