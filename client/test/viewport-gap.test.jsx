import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { calcularHueco, HUECO_MAXIMO } = await import("../src/utils/viewportGap.js");
const { useViewportGap } = await import("../src/hooks/useViewportGap.js");

describe("calcularHueco", () => {
  test("iOS en modo app con viewport corto: devuelve el hueco", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: 794 })).toBe(58);
  });

  test("viewport completo: no hay hueco", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: 852 })).toBe(0);
  });

  test("fuera de iOS en modo app no compensa nunca (Android, navegador)", () => {
    expect(calcularHueco({ iosStandalone: false, pantallaAlto: 915, ventanaAlto: 843 })).toBe(0);
  });

  test("un hueco negativo (ventana más alta que la pantalla) no mueve nada", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 800, ventanaAlto: 852 })).toBe(0);
  });

  test("un hueco enorme no es este bug: no se compensa", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: 852 - HUECO_MAXIMO - 1 })).toBe(0);
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: 852 - HUECO_MAXIMO })).toBe(HUECO_MAXIMO);
  });

  test("valores no numéricos no producen NaN", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: undefined, ventanaAlto: 800 })).toBe(0);
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: "x" })).toBe(0);
  });

  test("redondea", () => {
    expect(calcularHueco({ iosStandalone: true, pantallaAlto: 852, ventanaAlto: 793.6 })).toBe(58);
  });
});

describe("useViewportGap", () => {
  const Probe = () => {
    useViewportGap();
    return null;
  };

  let scrollTo;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    Object.defineProperty(window, "screen", { value: { width: 393, height: 852 }, configurable: true });
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
    document.documentElement.style.removeProperty("--vp-gap");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.navigator.standalone;
  });

  test("en iOS en modo app con viewport corto escribe --vp-gap y empuja el recálculo", () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 794, configurable: true });

    render(<Probe />);
    vi.advanceTimersByTime(50);

    expect(document.documentElement.style.getPropertyValue("--vp-gap")).toBe("58px");
    expect(scrollTo).toHaveBeenCalledWith(0, 1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  test("si el empujón alcanza (viewport completo) el hueco queda en 0", () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 852, configurable: true });

    render(<Probe />);
    vi.advanceTimersByTime(50);

    expect(document.documentElement.style.getPropertyValue("--vp-gap")).toBe("0px");
  });

  test("fuera de iOS en modo app no toca nada", () => {
    Object.defineProperty(window.navigator, "standalone", { value: false, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });

    render(<Probe />);
    vi.advanceTimersByTime(2000);

    expect(document.documentElement.style.getPropertyValue("--vp-gap")).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("al desmontar limpia la variable", () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 794, configurable: true });

    const { unmount } = render(<Probe />);
    vi.advanceTimersByTime(50);
    expect(document.documentElement.style.getPropertyValue("--vp-gap")).toBe("58px");

    unmount();
    expect(document.documentElement.style.getPropertyValue("--vp-gap")).toBe("");
  });
});
