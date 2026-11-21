import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

/**
 * Cargas «viejas» por escrituras continuas.
 *
 * Una carga que sale antes de una escritura y vuelve después trae datos de antes: se descarta y
 * se pide de nuevo, con un tope de 3. Lo que NO puede pasar es que, agotado el tope, no quede ni
 * lista ni error (el estado vacío que miente: «no tenés vinos»). Sin caché se usa lo último
 * recibido; con caché se deja el caché, que ya tiene las escrituras.
 */
const { wine, wish } = vi.hoisted(() => ({
  wine: { getWines: vi.fn(), updateWine: vi.fn() },
  wish: { getWishes: vi.fn(), createWish: vi.fn() },
}));

vi.mock("../src/services/wineApi", () => ({
  getWines: (...a) => wine.getWines(...a),
  createWine: vi.fn(),
  updateWine: (...a) => wine.updateWine(...a),
  deleteWine: vi.fn(),
  adjustWineStock: vi.fn(),
  openBottle: vi.fn(),
  undoOpenBottle: vi.fn(),
  bulkWines: vi.fn(),
}));
vi.mock("../src/services/wishApi", () => ({
  getWishes: (...a) => wish.getWishes(...a),
  createWish: (...a) => wish.createWish(...a),
  updateWish: vi.fn(),
  deleteWish: vi.fn(),
}));

const W = await import("../src/hooks/useWineCollection");
const H = await import("../src/hooks/useWishlist");

const v1 = { _id: "1", name: "Uno", quantity: 1 };
const v2 = { _id: "2", name: "Dos", quantity: 1 };

beforeEach(() => {
  W.limpiarCacheDeBodega();
  H.limpiarCacheDeDeseos();
  W.reiniciarEscrituras();
  H.reiniciarEscrituras();
  Object.values(wine).forEach((f) => f.mockReset());
  Object.values(wish).forEach((f) => f.mockReset());
});
afterEach(cleanup);

describe("bodega: tres cargas viejas seguidas", () => {
  it("tope de 3 pedidos, y se queda con la última respuesta (sin caché)", async () => {
    let escribir;
    const respuestas = [[v1], [v1, v2], [v1, v2, { _id: "3", name: "Tres" }]];
    wine.updateWine.mockResolvedValue(v1);
    // Para que la escritura corra sin caché hace falta otro montaje que la dispare.
    wine.getWines.mockImplementation(async () => {
      const r = respuestas.shift() ?? [];
      await null;
      await escribir?.();
      return r;
    });
    const escritor = renderHook(() => W.useWineCollection());
    escribir = () => escritor.result.current.updateWine("1", { rating: 1 });
    await waitFor(() => expect(escritor.result.current.loading).toBe(false));

    expect(wine.getWines).toHaveBeenCalledTimes(3);
    expect(escritor.result.current.error).toBe("");
    expect(escritor.result.current.wines.map((w) => w._id)).toEqual(["1", "2", "3"]);
  });

  it("con caché las escrituras ganan: la respuesta vieja no las deshace", async () => {
    wine.getWines.mockResolvedValueOnce([{ ...v1, quantity: 1 }]);
    const lista = renderHook(() => W.useWineCollection());
    await waitFor(() => expect(lista.result.current.loading).toBe(false));
    lista.unmount();

    let escribir;
    wine.updateWine.mockResolvedValue({ ...v1, quantity: 9 });
    wine.getWines.mockImplementation(async () => {
      await null;
      await escribir?.();
      return [{ ...v1, quantity: 1 }]; // vieja: no trae el 9
    });
    const montada = renderHook(() => W.useWineCollection());
    escribir = () => montada.result.current.updateWine("1", { quantity: 9 });
    await waitFor(() => expect(wine.getWines).toHaveBeenCalledTimes(1 + 3));

    expect(montada.result.current.wines[0].quantity).toBe(9);
    expect(montada.result.current.error).toBe("");
  });

  it("si el reintento falla, sin caché se informa el error (no queda vacío mudo)", async () => {
    let escribir;
    wine.updateWine.mockResolvedValue(v1);
    wine.getWines
      .mockImplementationOnce(async () => {
        await null;
      await escribir?.();
        return [v1];
      })
      .mockRejectedValueOnce(new Error("sin red"));
    const escritor = renderHook(() => W.useWineCollection());
    escribir = () => escritor.result.current.updateWine("1", { rating: 1 });
    await waitFor(() => expect(escritor.result.current.loading).toBe(false));

    expect(wine.getWines).toHaveBeenCalledTimes(2);
    expect(escritor.result.current.error).toBe("No se pudo cargar tu bodega.");
  });

  it("sin escrituras en vuelo, un solo pedido y la lista fresca", async () => {
    wine.getWines.mockResolvedValue([v1, v2]);
    const r = renderHook(() => W.useWineCollection());
    await waitFor(() => expect(r.result.current.wines).toHaveLength(2));
    expect(wine.getWines).toHaveBeenCalledTimes(1);
  });
});

describe("guardados: tres cargas viejas seguidas", () => {
  const w1 = { _id: "w1", name: "Uno" };
  const w2 = { _id: "w2", name: "Dos" };

  it("tope de 3 pedidos y se queda con la última respuesta (sin caché)", async () => {
    let escribir;
    const respuestas = [[w1], [w1, w2], [w1, w2, { _id: "w3" }]];
    wish.createWish.mockResolvedValue({ _id: "wN" });
    wish.getWishes.mockImplementation(async () => {
      const r = respuestas.shift() ?? [];
      await null;
      await escribir?.();
      return r;
    });
    const h = renderHook(() => H.useWishlist());
    escribir = () => h.result.current.addWish({ name: "N" });
    await waitFor(() => expect(h.result.current.loading).toBe(false));

    expect(wish.getWishes).toHaveBeenCalledTimes(3);
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.wishes.map((w) => w._id)).toEqual(["w1", "w2", "w3"]);
  });

  it("con caché, las escrituras ganan sobre la respuesta vieja", async () => {
    wish.getWishes.mockResolvedValueOnce([w1]);
    const primera = renderHook(() => H.useWishlist());
    await waitFor(() => expect(primera.result.current.loading).toBe(false));
    primera.unmount();

    let escribir;
    wish.createWish.mockResolvedValue({ _id: "wN" });
    wish.getWishes.mockImplementation(async () => {
      await null;
      await escribir?.();
      return [w1];
    });
    const h = renderHook(() => H.useWishlist());
    escribir = () => h.result.current.addWish({ name: "N" });
    await waitFor(() => expect(wish.getWishes).toHaveBeenCalledTimes(1 + 3));

    expect(h.result.current.wishes.map((w) => w._id)).toEqual(["wN", "w1"]);
    expect(h.result.current.error).toBeNull();
  });

  it("si el reintento falla y no hay caché, informa el error", async () => {
    let escribir;
    wish.createWish.mockResolvedValue({ _id: "wN" });
    wish.getWishes
      .mockImplementationOnce(async () => {
        await null;
      await escribir?.();
        return [w1];
      })
      .mockRejectedValueOnce(new Error("sin red"));
    const h = renderHook(() => H.useWishlist());
    escribir = () => h.result.current.addWish({ name: "N" });
    await waitFor(() => expect(h.result.current.loading).toBe(false));

    expect(wish.getWishes).toHaveBeenCalledTimes(2);
    expect(h.result.current.error).toBe("No se pudieron cargar tus guardados.");
  });
});
