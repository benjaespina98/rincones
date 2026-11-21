import { describe, it, expect, vi, beforeEach } from "vitest";

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/services/api", () => ({ default: api }));

const wineApi = await import("../src/services/wineApi");
const wishApi = await import("../src/services/wishApi");
const { limpiarDatosLocales } = await import("../src/utils/limpiarDatosLocales");

const CLAVE = "rincones_featured_u1_2099-01-01";
const guardarSet = () => localStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), set: [{ id: "a" }] }));
const hay = () => localStorage.getItem(CLAVE) !== null;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of [api.post, api.put, api.patch, api.delete]) m.mockResolvedValue({ data: { data: {} } });
  localStorage.clear();
  guardarSet();
});

/**
 * Los motivos de la tarjeta de Descubrí afirman hechos de la bodega («Tomaste Malbec», «Tenés Malbec en tu
 * bodega»). Si el set guardado sobrevive a un cambio de la bodega o de los deseos, la tarjeta miente hasta la
 * medianoche. Cada operación que cambia lo que el servidor usa para armar el set tiene que tirarlo.
 */
describe("cualquier cambio de la bodega o los deseos tira el set guardado de la tarjeta", () => {
  it.each([
    ["crear un vino", () => wineApi.createWine({ name: "x" })],
    ["editar un vino", () => wineApi.updateWine("1", { name: "x" })],
    ["borrar un vino", () => wineApi.deleteWine("1")],
    ["ajustar el stock", () => wineApi.adjustWineStock("1", 1)],
    ["abrir una botella", () => wineApi.openBottle("1", 1)],
    ["deshacer una apertura", () => wineApi.undoOpenBottle("1", false, 1)],
    ["contar un momento", () => wineApi.addWineMoment("1", { notes: "x" })],
    ["una acción en lote", () => wineApi.bulkWines(["1"], "tasted")],
    ["guardar un deseo", () => wishApi.createWish({ name: "x" })],
    ["borrar un deseo", () => wishApi.deleteWish("1")],
  ])("%s", async (_, accion) => {
    expect(hay()).toBe(true);
    await accion();
    expect(hay(), "el set guardado tendría que haberse tirado").toBe(false);
  });

  it("al cerrar sesión o borrar los datos locales también se tira", () => {
    limpiarDatosLocales();
    expect(hay()).toBe(false);
  });
});
