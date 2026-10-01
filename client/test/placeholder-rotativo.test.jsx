import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaceholderRotativo } from "../src/hooks/usePlaceholderRotativo";

const FRASES = ["Uno", "Dos", "Tres"];

beforeEach(() => {
  vi.useFakeTimers();
  delete window.matchMedia;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => vi.useRealTimers());

describe("usePlaceholderRotativo", () => {
  it("empieza en la primera frase", () => {
    const { result } = renderHook(() => usePlaceholderRotativo(FRASES));
    expect(result.current).toBe("Uno");
  });

  it("rota entre las frases y vuelve al principio", () => {
    const { result } = renderHook(() => usePlaceholderRotativo(FRASES, { cada: 1000 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("Dos");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("Tres");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("Uno");
  });

  it("no rota mientras no está activo (el campo tiene foco o texto)", () => {
    const { result } = renderHook(() => usePlaceholderRotativo(FRASES, { activo: false, cada: 1000 }));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe("Uno");
  });

  it("no rota con la pestaña oculta", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const { result } = renderHook(() => usePlaceholderRotativo(FRASES, { cada: 1000 }));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe("Uno");
  });

  it("con prefers-reduced-motion se queda quieto", () => {
    window.matchMedia = () => ({ matches: true });
    const { result } = renderHook(() => usePlaceholderRotativo(FRASES, { cada: 1000 }));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe("Uno");
  });

  it("con una sola frase no hay nada que rotar, y sin ninguna devuelve vacío", () => {
    const una = renderHook(() => usePlaceholderRotativo(["Sola"], { cada: 1000 }));
    act(() => vi.advanceTimersByTime(3000));
    expect(una.result.current).toBe("Sola");
    expect(renderHook(() => usePlaceholderRotativo([])).result.current).toBe("");
  });

  it("al desmontar no deja temporizadores", () => {
    const { unmount } = renderHook(() => usePlaceholderRotativo(FRASES, { cada: 1000 }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
