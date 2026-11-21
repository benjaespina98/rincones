import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `bulkWines` normaliza la respuesta del server: un server viejo no manda `ids` ni `omitidos`, y
 * los ids pueden venir como número. La pantalla compara siempre contra strings.
 */
const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../src/services/api", () => ({
  default: { post: (...a) => post(...a), get: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { bulkWines } = await import("../src/services/wineApi");

beforeEach(() => post.mockReset());

describe("bulkWines", () => {
  it("manda ids y acción a /wines/bulk", async () => {
    post.mockResolvedValue({ data: { data: { affected: 1, ids: ["a"], omitidos: 0 } } });
    await bulkWines(["a"], "delete");
    expect(post).toHaveBeenCalledWith("/wines/bulk", { ids: ["a"], action: "delete" });
  });

  it("una respuesta sin ids (server viejo) asume que entraron todos los pedidos, como string", async () => {
    post.mockResolvedValue({ data: { data: { affected: 2 } } });
    const r = await bulkWines([1, "b"], "tasted");
    expect(r.ids).toEqual(["1", "b"]);
    expect(r.affected).toBe(2);
  });

  it("omitidos ausente vale 0", async () => {
    post.mockResolvedValue({ data: { data: { affected: 1, ids: ["a"] } } });
    expect((await bulkWines(["a"], "favorite")).omitidos).toBe(0);
  });

  it("los ids numéricos de la respuesta se pasan a string", async () => {
    post.mockResolvedValue({ data: { data: { affected: 2, ids: [10, 11], omitidos: 1 } } });
    const r = await bulkWines(["10", "11", "12"], "delete");
    expect(r.ids).toEqual(["10", "11"]);
    expect(r.omitidos).toBe(1);
  });

  it("sin cuerpo de datos devuelve ceros y los ids pedidos", async () => {
    post.mockResolvedValue({ data: {} });
    expect(await bulkWines(["a"], "delete")).toEqual({ affected: 0, ids: ["a"], omitidos: 0 });
  });
});
