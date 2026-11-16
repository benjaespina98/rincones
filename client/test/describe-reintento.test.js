import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("../src/services/api", () => ({ default: { post: (...a) => post(...a), get: vi.fn() } }));

const { describeWine } = await import("../src/services/wineSearchApi");

const vino = { name: "Nicasia", winery: "Catena", varietal: "Malbec" };

beforeEach(() => {
  post.mockReset();
});

describe("describeWine: la ficha no falla a la primera por algo transitorio", () => {
  it("si el primer intento falla por el server, reintenta una vez y devuelve la ficha", async () => {
    post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { data: { summary: "ok" } } });
    const info = await describeWine(vino);
    expect(info).toEqual({ summary: "ok" });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("un timeout (sin respuesta) también se reintenta", async () => {
    post.mockRejectedValueOnce({ code: "ECONNABORTED" }).mockResolvedValueOnce({ data: { data: { summary: "ok" } } });
    expect(await describeWine(vino)).toEqual({ summary: "ok" });
  });

  it("un 400 no se reintenta", async () => {
    post.mockRejectedValue({ response: { status: 400 } });
    await expect(describeWine(vino)).rejects.toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("pide con más margen que los 12 s del resto", async () => {
    post.mockResolvedValue({ data: { data: {} } });
    await describeWine(vino);
    expect(post.mock.calls[0][2].timeout).toBeGreaterThan(12000);
  });
});

describe("getWineRecipe: mismo trato que la ficha", () => {
  it("reintenta una vez ante un fallo transitorio", async () => {
    const { getWineRecipe } = await import("../src/services/wineSearchApi");
    post.mockRejectedValueOnce({ code: "ECONNABORTED" }).mockResolvedValueOnce({ data: { data: { dish: "x" } } });
    expect(await getWineRecipe(vino, "cena")).toEqual({ dish: "x" });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][2].timeout).toBeGreaterThan(12000);
  });
});
