import { describe, it, expect, vi, beforeEach } from "vitest";

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("../src/services/api", () => ({ default: api }));

const { adjustWineStock, openBottle, undoOpenBottle } = await import("../src/services/wineApi");

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  api.patch.mockResolvedValue({ data: { data: {} } });
});

describe("el stock manda lo que hace falta para que «Deshacer» saque de donde corresponde", () => {
  it("«Deshacer» una reposición manda undoRestock; un «−» común no", async () => {
    await adjustWineStock("w1", -2, { undoRestock: true });
    expect(api.patch).toHaveBeenLastCalledWith("/wines/w1/stock", { delta: -2, undoRestock: true });
    await adjustWineStock("w1", -1);
    expect(api.patch).toHaveBeenLastCalledWith("/wines/w1/stock", { delta: -1 });
  });

  it("abrir y deshacer una apertura siguen siendo sus operaciones (no se mezclan con la reposición)", async () => {
    await openBottle("w1", 2);
    expect(api.patch).toHaveBeenLastCalledWith("/wines/w1/stock", { delta: -2, markTasted: true });
    await undoOpenBottle("w1", false, 2);
    expect(api.patch).toHaveBeenLastCalledWith("/wines/w1/stock", { delta: 2, undoOpen: true, wasTasted: false });
  });
});
