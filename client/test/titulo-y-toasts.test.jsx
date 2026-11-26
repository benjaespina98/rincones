import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { ToastProvider, useToast } from "../src/context/ToastContext";
import { useDocumentTitle } from "../src/hooks/useDocumentTitle";

afterEach(() => {
  cleanup();
  document.title = "Rincones";
});

describe("useDocumentTitle", () => {
  it("pone «Pantalla · Rincones» y cambia al cambiar la pantalla", () => {
    const { rerender } = renderHook(({ t }) => useDocumentTitle(t), { initialProps: { t: "Mi Bodega" } });
    expect(document.title).toBe("Mi Bodega · Rincones");
    rerender({ t: "Perfil" });
    expect(document.title).toBe("Perfil · Rincones");
  });

  it("sin título vuelve a la marca sola", () => {
    renderHook(() => useDocumentTitle(""));
    expect(document.title).toBe("Rincones");
  });
});

describe("duración de los avisos", () => {
  const duraciones = () => renderHook(() => useToast(), { wrapper: ToastProvider }).result.current;

  it("un error dura más que un aviso de éxito, y se puede pedir otra duración", () => {
    const api = duraciones();
    // `addToast` devuelve el id; la duración se lee del estado a través del DOM del Toast. Se
    // verifica por el contrato: el valor por defecto lo decide addToast según el tipo.
    let visto = [];
    const original = global.setTimeout;
    global.setTimeout = (fn, ms, ...r) => { visto.push(ms); return original(fn, ms, ...r); };
    try {
      act(() => { api.showError("falló"); });
      act(() => { api.showSuccess("listo"); });
      act(() => { api.showError("falló", 1500); });
    } finally {
      global.setTimeout = original;
    }
    expect(visto).toContain(7000);
    expect(visto).toContain(3000);
    expect(visto).toContain(1500);
  });
});

describe("el aviso con acción", () => {
  it("no muestra la × al lado de «Deshacer», y sin acción sí", async () => {
    const { default: Toast } = await import("../src/components/Toast");
    const { render: pintar, screen: pantalla, cleanup: limpiar } = await import("@testing-library/react");
    limpiar();
    pintar(<Toast message="Vino eliminado" action={{ label: "Deshacer", onClick: () => {} }} />);
    expect(pantalla.queryByRole("button", { name: /cerrar notificación/i })).toBeNull();
    limpiar();
    pintar(<Toast message="Listo" />);
    expect(pantalla.getByRole("button", { name: /cerrar notificación/i })).toBeTruthy();
    limpiar();
  });
});
