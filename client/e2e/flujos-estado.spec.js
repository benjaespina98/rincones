import { test, expect } from "@playwright/test";
import { API, con, crearUsuarioListo, entrar } from "./helpers";
import { payloadParaRestaurar } from "../src/utils/restoreWine.js";

// Los estados de un vino son tres ejes independientes (quantity, tasted, favorite): ninguna combinación puede
// dejar un vino sin lugar en la pantalla ni perder su historial.
const crear = async (request, u, data) => (await (await request.post(`${API}/wines`, { ...con(u.token), data })).json()).data;
const leer = async (request, u, id) => (await (await request.get(`${API}/wines/${id}`, con(u.token))).json()).data;
const stock = (request, u, id, data) => request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data });
const sumaLotes = (w) => w.lots.reduce((n, l) => n + l.remaining, 0);

test("secuencia de operaciones: la cantidad siempre es la suma de los lotes y lo tomado no se pierde", async ({ request }) => {
  const u = await crearUsuarioListo(request, "inv2");
  const w = await crear(request, u, { name: "Secuencia Malbec", winery: "Sec", varietal: "Malbec", quantity: 2 });
  const pasos = [
    ["abrir una", () => stock(request, u, w._id, { delta: -1, markTasted: true })],
    ["abrir la última", () => stock(request, u, w._id, { delta: -1, markTasted: true })],
    ["sumar una (tomado, sin stock)", () => stock(request, u, w._id, { delta: 1 })],
    ["quitar una sin tomarla", () => stock(request, u, w._id, { delta: -1 })],
    [
      "alta del mismo vino (suma)",
      () => request.post(`${API}/wines`, { ...con(u.token), data: { name: "Secuencia Malbec", winery: "Sec", varietal: "Malbec", quantity: 2 } }),
    ],
    ["corregir la cantidad a 0", () => request.put(`${API}/wines/${w._id}`, { ...con(u.token), data: { quantity: 0 } })],
    ["corregir la cantidad a 3", () => request.put(`${API}/wines/${w._id}`, { ...con(u.token), data: { quantity: 3 } })],
    ["fijar el stock en 0", () => stock(request, u, w._id, { quantity: 0 })],
  ];
  let lotes = 0;
  let tomas = 0;
  for (const [nombre, hacer] of pasos) {
    await hacer();
    const v = await leer(request, u, w._id);
    expect(v.quantity, `${nombre}: quantity == suma de remaining`).toBe(sumaLotes(v));
    expect(v.tasted, `${nombre}: lo tomado sigue tomado`).toBe(true);
    expect(v.lots.length, `${nombre}: los lotes (también los agotados) no se pierden`).toBeGreaterThanOrEqual(lotes);
    expect(v.consumptionCount ?? 0, `${nombre}: las tomas no bajan`).toBeGreaterThanOrEqual(tomas);
    lotes = v.lots.length;
    tomas = v.consumptionCount ?? 0;
  }
  const lista = (await (await request.get(`${API}/wines`, con(u.token))).json()).data;
  expect(lista.filter((v) => /Secuencia/.test(v.name)), "un solo vino, nunca duplicado ni borrado").toHaveLength(1);
});

test("«Deshacer» un borrado devuelve los lotes, las fechas y la compra", async ({ request }) => {
  const u = await crearUsuarioListo(request, "res");
  const w = await crear(request, u, {
    name: "Restaurar Malbec",
    winery: "Res",
    varietal: "Malbec",
    quantity: 6,
    purchasedAt: "2019-03-10",
    price: 9000,
    store: "Vinoteca",
  });
  await stock(request, u, w._id, { delta: -6, markTasted: true });
  await stock(request, u, w._id, { delta: 3 });
  await stock(request, u, w._id, { delta: -1, markTasted: true });
  const antes = await leer(request, u, w._id);
  expect(antes.lots.length).toBe(2);

  await request.delete(`${API}/wines/${w._id}`, con(u.token));
  const restaurado = (await (await request.post(`${API}/wines`, { ...con(u.token), data: payloadParaRestaurar(antes) })).json()).data;

  expect(restaurado.lots.map((l) => [l.quantity, l.remaining])).toEqual(antes.lots.map((l) => [l.quantity, l.remaining]));
  expect(new Date(restaurado.lots[0].addedAt).getTime(), "la compra de 2019 no pasa a ser de hoy").toBe(new Date(antes.lots[0].addedAt).getTime());
  expect(restaurado.quantity).toBe(antes.quantity);
  expect(restaurado.tasted).toBe(true);
  expect(restaurado.consumptionCount).toBe(antes.consumptionCount);
  expect(new Date(restaurado.purchase.purchasedAt).getUTCFullYear()).toBe(2019);
});

test("«Deshacer» no inventa un consumo ni marca como tomado un vino sin probar", async ({ request }) => {
  const u = await crearUsuarioListo(request, "res2");
  const w = await crear(request, u, { name: "Sin Probar Malbec", winery: "Res", varietal: "Malbec", quantity: 2 });
  await stock(request, u, w._id, { delta: -2 });
  const antes = await leer(request, u, w._id);
  expect([antes.quantity, antes.tasted]).toEqual([0, false]);
  await request.delete(`${API}/wines/${w._id}`, con(u.token));
  const r = (await (await request.post(`${API}/wines`, { ...con(u.token), data: payloadParaRestaurar(antes) })).json()).data;
  expect([r.quantity, r.tasted, r.consumptionCount ?? 0]).toEqual([0, false, 0]);
});

test("un vino sin botellas y sin probar no desaparece: aparece en «Sin stock» y se puede volver a sumar", async ({ page, request }) => {
  const u = await crearUsuarioListo(request, "sst");
  const w = await crear(request, u, { name: "Sin Stock Uno", winery: "SS", varietal: "Malbec", quantity: 2 });
  await entrar(page, u);
  await page.goto(`/vino/${w._id}`);
  const quitar = page.getByRole("button", { name: /Quitar una sin tomarla/ });
  await quitar.click();
  await expect.poll(async () => (await leer(request, u, w._id)).quantity).toBe(1);
  await quitar.click();
  await expect.poll(async () => (await leer(request, u, w._id)).quantity).toBe(0);
  await expect(page.getByText(/sigue guardado en «Sin stock»/)).toBeVisible();
  expect((await leer(request, u, w._id)).tasted).toBe(false);

  // En ninguna de las tres pestañas de siempre, pero sí en la nueva.
  await page.goto("/bodega");
  const pestania = page.locator(".bodega-vista").getByText("Sin stock");
  await expect(pestania.first()).toBeVisible();
  await pestania.first().click();
  const fila = page.locator(".wine-row", { hasText: "Sin Stock Uno" }).first();
  await expect(fila).toBeVisible();
  await expect(fila).toContainText("Sin botellas · tocá + para sumar una al stock");

  // Sumar una: vuelve a En stock y la pestaña «Sin stock» deja de hacer falta.
  await fila.getByRole("button", { name: "Sumar una botella" }).click();
  await expect.poll(async () => (await leer(request, u, w._id)).quantity).toBe(1);
  await page.goto("/bodega");
  await expect(page.locator(".wine-row", { hasText: "Sin Stock Uno" }).first()).toBeVisible();
  await expect(page.locator(".bodega-vista").getByText("Sin stock")).toHaveCount(0);
});

test("sacar de «Ya tomados» un vino sin botellas lo deja en «Sin stock» y lo dice", async ({ page, request }) => {
  const u = await crearUsuarioListo(request, "des");
  const w = await crear(request, u, { name: "Desmarcar Uno", winery: "DM", varietal: "Malbec", quantity: 1 });
  await stock(request, u, w._id, { delta: -1, markTasted: true });
  await entrar(page, u);
  await page.goto("/bodega?vista=probados");
  const fila = page.locator(".wine-row", { hasText: "Desmarcar Uno" }).first();
  await fila.locator(".wine-row__disclosure").click();
  await fila.getByRole("button", { name: "Marcar como sin probar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sacarlo" }).click();
  await expect(page.getByText(/sigue guardado en «Sin stock»/)).toBeVisible();

  const v = await leer(request, u, w._id);
  expect([v.tasted, v.quantity, v.consumptionCount]).toEqual([false, 0, 1]);
  await page.goto("/bodega?vista=sin-stock");
  await expect(page.locator(".wine-row", { hasText: "Desmarcar Uno" }).first()).toBeVisible();
});
