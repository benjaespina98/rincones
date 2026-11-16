import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
vi.mock("../src/services/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }));

const { getWineReviews, limpiarCacheDeResenas } = await import("../src/services/reviewApi");

beforeEach(() => {
  get.mockReset();
  limpiarCacheDeResenas();
});

describe("caché de reseñas", () => {
  it("una segunda lectura del mismo vino no vuelve a pedir", async () => {
    get.mockResolvedValue({ data: { data: { summary: null, mine: { rating: 5 }, reviews: [] } } });
    await getWineReviews("Nicasia", "Catena", "Malbec");
    await getWineReviews("Nicasia", "Catena", "Malbec");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("al limpiar (cierre de sesión) la tuya no sobrevive: vuelve a pedir", async () => {
    get.mockResolvedValue({ data: { data: { summary: null, mine: { rating: 5 }, reviews: [] } } });
    await getWineReviews("Nicasia", "Catena", "Malbec");
    limpiarCacheDeResenas();
    get.mockResolvedValue({ data: { data: { summary: null, mine: null, reviews: [] } } });
    const otra = await getWineReviews("Nicasia", "Catena", "Malbec");
    expect(get).toHaveBeenCalledTimes(2);
    expect(otra.mine).toBeNull();
  });
});
