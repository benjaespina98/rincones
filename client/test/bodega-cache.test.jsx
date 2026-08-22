import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

/**
 * El caché de Mi Bodega.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * El hook pedía la colección entera en CADA montaje, y Mi Bodega se monta cada
 * vez que se entra a la pestaña: mirabas un vino, volvías con el botón de atrás,
 * y la lista que acababas de ver se borraba para mostrar un esqueleto mientras
 * la red traía exactamente lo mismo.
 *
 * ── LO QUE ESTAS PRUEBAS SOSTIENEN ──────────────────────────────────────────
 * Un caché que miente es peor que no tener caché, así que lo que hay que fijar
 * no es "va más rápido" sino las tres reglas que lo hacen seguro:
 *
 *   1. al volver, la lista está desde el primer frame y sin esqueleto;
 *   2. se revalida igual, así que un cambio hecho en otro lado aparece;
 *   3. toda escritura mueve el caché con la pantalla, y cerrar sesión lo borra.
 */

const getWines = vi.fn();
const deleteWineApi = vi.fn();

vi.mock("../src/services/wineApi", () => ({
  getWines: (...a) => getWines(...a),
  createWine: vi.fn(),
  updateWine: vi.fn(),
  deleteWine: (...a) => deleteWineApi(...a),
  adjustWineStock: vi.fn(),
  openBottle: vi.fn(),
  undoOpenBottle: vi.fn(),
  bulkWines: vi.fn(),
}));

const { useWineCollection, limpiarCacheDeBodega } = await import(
  "../src/hooks/useWineCollection"
);

const malbec = { _id: "1", name: "Portillo", quantity: 3 };
const cabernet = { _id: "2", name: "Rutini", quantity: 1 };

beforeEach(() => {
  limpiarCacheDeBodega();
  getWines.mockReset();
  deleteWineApi.mockReset();
});

afterEach(cleanup);

describe("el caché de la bodega", () => {
  it("la primera vez anuncia carga; al volver, la lista ya está sin esqueleto", async () => {
    getWines.mockResolvedValue([malbec, cabernet]);

    const primera = renderHook(() => useWineCollection());
    // Sin nada guardado, se anuncia la espera: la pantalla no tiene qué mostrar.
    expect(primera.result.current.loading).toBe(true);
    await waitFor(() => expect(primera.result.current.loading).toBe(false));
    expect(primera.result.current.wines).toHaveLength(2);

    primera.unmount();

    // Volver a entrar: la lista está desde el primer render y NO se anuncia
    // carga. Es exactamente el parpadeo que se vino a sacar.
    const segunda = renderHook(() => useWineCollection());
    expect(segunda.result.current.loading).toBe(false);
    expect(segunda.result.current.wines).toHaveLength(2);
  });

  it("aunque muestre lo guardado, revalida: un cambio de otro lado aparece", async () => {
    getWines.mockResolvedValueOnce([malbec, cabernet]);

    const primera = renderHook(() => useWineCollection());
    await waitFor(() => expect(primera.result.current.wines).toHaveLength(2));
    primera.unmount();

    // Mientras tanto, en otra pestaña, se agregó un vino.
    getWines.mockResolvedValueOnce([malbec, cabernet, { _id: "3", name: "Nuevo" }]);

    const segunda = renderHook(() => useWineCollection());
    // Arranca con lo viejo…
    expect(segunda.result.current.wines).toHaveLength(2);
    // …y se pone al día solo.
    await waitFor(() => expect(segunda.result.current.wines).toHaveLength(3));
    expect(getWines).toHaveBeenCalledTimes(2);
  });

  it("si la revalidación falla, se sigue mostrando la lista buena y no un error", async () => {
    getWines.mockResolvedValueOnce([malbec, cabernet]);
    const primera = renderHook(() => useWineCollection());
    await waitFor(() => expect(primera.result.current.wines).toHaveLength(2));
    primera.unmount();

    getWines.mockRejectedValueOnce(new Error("sin red"));
    const segunda = renderHook(() => useWineCollection());
    await waitFor(() => expect(getWines).toHaveBeenCalledTimes(2));

    // Datos válidos en pantalla no se reemplazan por un cartel rojo porque una
    // petición de fondo se cayó.
    expect(segunda.result.current.wines).toHaveLength(2);
    expect(segunda.result.current.error).toBe("");
  });

  it("borrar un vino lo saca también del caché, no sólo de la pantalla", async () => {
    getWines.mockResolvedValue([malbec, cabernet]);
    deleteWineApi.mockResolvedValue({});

    const primera = renderHook(() => useWineCollection());
    await waitFor(() => expect(primera.result.current.wines).toHaveLength(2));

    await act(async () => {
      await primera.result.current.deleteWine("1");
    });
    expect(primera.result.current.wines).toHaveLength(1);
    primera.unmount();

    // Al volver, el vino borrado NO puede reaparecer mientras revalida: sería el
    // caché contando una versión de los hechos que ya no es cierta.
    const segunda = renderHook(() => useWineCollection());
    expect(segunda.result.current.wines).toHaveLength(1);
    expect(segunda.result.current.wines[0]._id).toBe("2");
  });

  it("cerrar sesión borra el caché: la bodega no se le muestra al siguiente", async () => {
    getWines.mockResolvedValue([malbec, cabernet]);

    const primera = renderHook(() => useWineCollection());
    await waitFor(() => expect(primera.result.current.wines).toHaveLength(2));
    primera.unmount();

    // Es lo que hace el logout (ver AuthContext).
    limpiarCacheDeBodega();

    const segunda = renderHook(() => useWineCollection());
    // Sin datos y anunciando carga, como un usuario nuevo: no se filtra ni un
    // frame de la bodega anterior.
    expect(segunda.result.current.wines).toHaveLength(0);
    expect(segunda.result.current.loading).toBe(true);
  });
});
