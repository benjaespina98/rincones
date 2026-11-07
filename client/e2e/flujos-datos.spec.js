import { test, expect } from "@playwright/test";
import { API, con, crearUsuarioListo } from "./helpers";
import { payloadParaRestaurar } from "../src/utils/restoreWine.js";

// Pérdidas de datos que encontró la auditoría de flujos: cada test es un caso que perdía algo.
const crear = async (request, u, data) => (await (await request.post(`${API}/wines`, { ...con(u.token), data })).json()).data;
const leer = async (request, u, id) => (await (await request.get(`${API}/wines/${id}`, con(u.token))).json()).data;
const stock = (request, u, id, data) => request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data });

test("«Deshacer» una reposición saca del lote recién agregado, no del más viejo", async ({ request }) => {
  const u = await crearUsuarioListo(request, "und");
  const w = await crear(request, u, { name: "Deshacer Repo", winery: "DR", varietal: "Malbec", quantity: 1 });
  await stock(request, u, w._id, { delta: 2 });
  const conRepo = await leer(request, u, w._id);
  expect(conRepo.lots.map((l) => [l.quantity, l.remaining])).toEqual([[1, 1], [2, 2]]);

  // Lo que hacía antes (un «−» común) vaciaba el lote más viejo: el comportamiento FIFO sigue ahí para el «−».
  await stock(request, u, w._id, { delta: -2, undoRestock: true });
  const despues = await leer(request, u, w._id);
  expect(despues.lots.map((l) => [l.quantity, l.remaining]), "el lote agregado desaparece, el original queda intacto").toEqual([[1, 1]]);
  expect(despues.lots[0].depletedAt, "no se inventa una botella tomada").toBeUndefined();
  expect(despues.quantity).toBe(1);
  expect(despues.tasted).toBe(false);
  expect(despues.consumptionCount ?? 0).toBe(0);
});

test("deshacer una reposición parcial achica el último lote y la cantidad coincide", async ({ request }) => {
  const u = await crearUsuarioListo(request, "und2");
  const w = await crear(request, u, { name: "Deshacer Parcial", winery: "DP", varietal: "Malbec", quantity: 1 });
  await stock(request, u, w._id, { delta: 3 });
  await stock(request, u, w._id, { delta: -1, undoRestock: true });
  const v = await leer(request, u, w._id);
  expect(v.lots.map((l) => [l.quantity, l.remaining])).toEqual([[1, 1], [2, 2]]);
  expect(v.quantity).toBe(3);
});

test("el «−» común sigue siendo FIFO (no cambió)", async ({ request }) => {
  const u = await crearUsuarioListo(request, "und3");
  const w = await crear(request, u, { name: "Fifo Comun", winery: "FC", varietal: "Malbec", quantity: 1 });
  await stock(request, u, w._id, { delta: 2 });
  await stock(request, u, w._id, { delta: -1 });
  const v = await leer(request, u, w._id);
  expect(v.lots.map((l) => l.remaining)).toEqual([0, 2]);
});

test("cargar otra botella de un vino que ya tenés conserva su precio y su tienda", async ({ request }) => {
  const u = await crearUsuarioListo(request, "fus");
  const w = await crear(request, u, { name: "Fusion Precio", winery: "FP", varietal: "Malbec", quantity: 1 });
  const r = await (
    await request.post(`${API}/wines`, {
      ...con(u.token),
      data: { name: "Fusion Precio", winery: "FP", varietal: "Malbec", quantity: 2, price: 9000, store: "Vinoteca Centro" },
    })
  ).json();
  expect(r.merged).toBe(true);
  const v = await leer(request, u, w._id);
  expect(v.quantity).toBe(3);
  const lote = v.lots[1];
  expect(lote.price, "el precio de ESA compra queda en su lote").toBe(9000);
  expect(lote.store).toBe("Vinoteca Centro");
});

test("restaurar un vino borrado no se funde con otro igual: no pierde su puntaje, notas ni favorito", async ({ request }) => {
  const u = await crearUsuarioListo(request, "dup");
  const a = await crear(request, u, { name: "Duplicado Uno", winery: "DU", varietal: "Malbec", quantity: 3, rating: 5, notes: "el de la cena", favorite: true });
  const antes = await leer(request, u, a._id);
  await request.delete(`${API}/wines/${a._id}`, con(u.token));
  // Antes del «Deshacer», la persona vuelve a cargar el mismo vino.
  await crear(request, u, { name: "Duplicado Uno", winery: "DU", varietal: "Malbec", quantity: 1 });
  const restaurado = (await (await request.post(`${API}/wines`, { ...con(u.token), data: payloadParaRestaurar(antes) })).json()).data;
  expect(restaurado.rating).toBe(5);
  expect(restaurado.notes).toBe("el de la cena");
  expect(restaurado.favorite).toBe(true);
  expect(restaurado.quantity).toBe(3);
});

test("editar la fecha de compra se guarda, y se puede vaciar un campo", async ({ request }) => {
  const u = await crearUsuarioListo(request, "edi");
  const w = await crear(request, u, { name: "Editar Campos", winery: "EC", varietal: "Malbec", quantity: 1, price: 5000, store: "Vieja", cellarLocation: "Cava 1" });
  await request.put(`${API}/wines/${w._id}`, { ...con(u.token), data: { purchasedAt: "2020-05-01" } });
  expect(new Date((await leer(request, u, w._id)).purchase.purchasedAt).getUTCFullYear()).toBe(2020);

  await request.put(`${API}/wines/${w._id}`, { ...con(u.token), data: { price: "", store: "", cellarLocation: "", purchasedAt: "" } });
  const v = await leer(request, u, w._id);
  expect(v.purchase.price).toBeUndefined();
  expect(v.purchase.store).toBeUndefined();
  expect(v.cellar?.location).toBeUndefined();
  expect(v.purchase.purchasedAt).toBeUndefined();
});

test("anotar con cero botellas un vino sin probar suma al contador de tomados del perfil", async ({ request }) => {
  const u = await crearUsuarioListo(request, "cnt");
  const tomados = async () => (await (await request.get(`${API}/users/profile`, con(u.token))).json()).data?.stats?.tastedWines ?? 0;
  await crear(request, u, { name: "Contador Uno", winery: "CU", varietal: "Malbec", quantity: 1 });
  const antes = await tomados();
  await request.post(`${API}/wines`, { ...con(u.token), data: { name: "Contador Uno", winery: "CU", varietal: "Malbec", quantity: 0 } });
  expect(await tomados()).toBe(antes + 1);
});
