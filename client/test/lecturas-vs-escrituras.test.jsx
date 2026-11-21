import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Una respuesta VIEJA del GET no puede pisar una escritura reciente (tocar «−» y
 * ver volver la cantidad anterior), y una acción en lote sólo saca de la pantalla
 * lo que el server de verdad procesó.
 */

const getWines = vi.fn();
const adjustWineStock = vi.fn();
const bulkWines = vi.fn();
const getWishes = vi.fn();
const updateWish = vi.fn();

vi.mock("../src/services/wineApi", () => ({
  getWines: (...a) => getWines(...a),
  createWine: vi.fn(),
  updateWine: vi.fn(),
  deleteWine: vi.fn(),
  adjustWineStock: (...a) => adjustWineStock(...a),
  openBottle: vi.fn(),
  undoOpenBottle: vi.fn(),
  bulkWines: (...a) => bulkWines(...a),
}));
vi.mock("../src/services/wishApi", () => ({
  getWishes: (...a) => getWishes(...a),
  createWish: vi.fn(),
  updateWish: (...a) => updateWish(...a),
  deleteWish: vi.fn(),
}));
vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), addToast: vi.fn(), removeToast: vi.fn() }),
}));

const { useWineCollection, limpiarCacheDeBodega } = await import("../src/hooks/useWineCollection");
const { useWishlist, limpiarCacheDeDeseos } = await import("../src/hooks/useWishlist");
const WishlistPanel = (await import("../src/components/WishlistPanel")).default;

const diferido = () => {
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  return { promesa, resolver };
};

beforeEach(() => {
  limpiarCacheDeBodega();
  limpiarCacheDeDeseos();
  for (const m of [getWines, adjustWineStock, bulkWines, getWishes, updateWish]) m.mockReset();
});
afterEach(cleanup);

describe("la bodega: una carga vieja no pisa una escritura", () => {
  it("el GET que salió antes del «−» y vuelve después NO devuelve la cantidad anterior", async () => {
    getWines.mockResolvedValueOnce([{ _id: "1", quantity: 3 }]);
    const { result } = renderHook(() => useWineCollection());
    await waitFor(() => expect(result.current.wines).toHaveLength(1));

    // Revalidación en vuelo con la foto vieja (3 botellas).
    const lenta = diferido();
    getWines.mockReturnValueOnce(lenta.promesa);
    // Y el re-pedido posterior ya trae la verdad.
    getWines.mockResolvedValue([{ _id: "1", quantity: 2 }]);
    act(() => { result.current.recargar(); });

    adjustWineStock.mockResolvedValue({ _id: "1", quantity: 2 });
    await act(async () => { await result.current.adjustStock("1", -1); });
    expect(result.current.wines[0].quantity).toBe(2);

    // Llega la respuesta vieja.
    await act(async () => { lenta.resolver([{ _id: "1", quantity: 3 }]); });
    await waitFor(() => expect(getWines).toHaveBeenCalledTimes(3));
    expect(result.current.wines[0].quantity).toBe(2);
  });

  it("una acción en lote quita sólo los ids que el server procesó", async () => {
    getWines.mockResolvedValueOnce([{ _id: "1" }, { _id: "2" }, { _id: "3" }]);
    const { result } = renderHook(() => useWineCollection());
    await waitFor(() => expect(result.current.wines).toHaveLength(3));

    bulkWines.mockResolvedValue({ affected: 2, ids: ["1", "2"], omitidos: 1 });
    let r;
    await act(async () => { r = await result.current.bulkAction(["1", "2", "3"], "delete"); });
    expect(r.omitidos).toBe(1);
    expect(result.current.wines.map((w) => w._id)).toEqual(["3"]);
  });
});

describe("los deseos: una carga vieja no pisa una escritura", () => {
  it("el GET viejo no deshace el corazón recién puesto", async () => {
    getWishes.mockResolvedValueOnce([{ _id: "a", favorite: false }]);
    const { result } = renderHook(() => useWishlist());
    await waitFor(() => expect(result.current.wishes).toHaveLength(1));

    const lenta = diferido();
    getWishes.mockReturnValueOnce(lenta.promesa);
    getWishes.mockResolvedValue([{ _id: "a", favorite: true }]);
    act(() => { result.current.reload(); });

    updateWish.mockResolvedValue({ _id: "a", favorite: true });
    await act(async () => { await result.current.toggleWishFavorite("a", true); });

    await act(async () => { lenta.resolver([{ _id: "a", favorite: false }]); });
    await waitFor(() => expect(getWishes).toHaveBeenCalledTimes(3));
    expect(result.current.wishes[0].favorite).toBe(true);
  });
});

describe("la búsqueda de Guardados ignora acentos", () => {
  it("«torrontes» encuentra «Torrontés»", () => {
    const wishes = [
      { _id: "1", name: "Alta Vista", varietal: "Torrontés", type: "white" },
      { _id: "2", name: "Rutini", varietal: "Malbec", type: "red" },
    ];
    render(
      <MemoryRouter>
        <WishlistPanel wishes={wishes} loading={false} error={null} reload={() => {}} terms={["torrontes"]} />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Alta Vista/)).not.toBeNull();
    expect(screen.queryByText(/Rutini/)).toBeNull();
  });
});
