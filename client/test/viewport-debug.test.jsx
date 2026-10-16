import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { default: ViewportDebug } = await import("../src/components/ViewportDebug.jsx");

/**
 * El panel de diagnóstico del viewport sólo existe para medir en un teléfono. Lo que
 * importa es que NO aparezca para nadie que no lo pidió, que no rompa si el almacenamiento
 * falla (Safari privado) y que no deje un intervalo corriendo.
 */
const poner = (url) => window.history.replaceState({}, "", url);

describe("ViewportDebug", () => {
  beforeEach(() => {
    sessionStorage.clear();
    poner("/bodega");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    poner("/");
  });

  test("sin ?vp=1 ni bandera no renderiza nada", () => {
    const { container } = render(<ViewportDebug />);
    expect(container.querySelector("pre")).toBeNull();
  });

  test("con ?vp=1 muestra las mediciones y deja la bandera para la navegación interna", () => {
    poner("/bodega?vp=1");
    const { container } = render(<ViewportDebug />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    for (const clave of ["innerHeight", "screenHeight", "standalone", "vpGap", "navBottom", "insetAbajo"]) {
      expect(pre.textContent).toContain(`${clave}:`);
    }
    expect(sessionStorage.getItem("rincones_vp_debug")).toBe("1");
  });

  test("la bandera guardada alcanza para seguir viéndolo en otra pantalla", () => {
    sessionStorage.setItem("rincones_vp_debug", "1");
    const { container } = render(<ViewportDebug />);
    expect(container.querySelector("pre")).not.toBeNull();
  });

  test("es sólo informativo: no captura toques ni se anuncia a lectores de pantalla", () => {
    poner("/bodega?vp=1");
    const { container } = render(<ViewportDebug />);
    const pre = container.querySelector("pre");
    expect(pre).toHaveAttribute("aria-hidden", "true");
    expect(pre.style.pointerEvents).toBe("none");
  });

  test("si sessionStorage tira (Safari privado) no explota y no se muestra", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    poner("/bodega?vp=1");
    expect(() => render(<ViewportDebug />)).not.toThrow();
  });

  test("al desmontar deja de actualizar", () => {
    vi.useFakeTimers();
    poner("/bodega?vp=1");
    const { unmount } = render(<ViewportDebug />);
    const antes = vi.getTimerCount();
    expect(antes).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBeLessThan(antes);
  });

  test("sin la bandera no deja ningún intervalo corriendo", () => {
    vi.useFakeTimers();
    render(<ViewportDebug />);
    expect(vi.getTimerCount()).toBe(0);
  });
});
