import { test, expect } from "@playwright/test";
import { API, con, crearUsuarioListo, entrar } from "./helpers";

const crearVinoTomado = async (request, u, nombre) => {
  const id = (
    await (
      await request.post(`${API}/wines`, {
        ...con(u.token),
        data: { name: nombre, winery: "E2E", varietal: "Malbec", quantity: 1 },
      })
    ).json()
  ).data._id;
  await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: -1, markTasted: true } });
  return id;
};

const leer = async (request, u, id) => (await (await request.get(`${API}/wines/${id}`, con(u.token))).json()).data;

test("un vino tomado al que le sumás una botella y se la abrís sigue en Ya tomados y lo dice", async ({ page, request }) => {
  const u = await crearUsuarioListo(request, "tom");
  const id = await crearVinoTomado(request, u, "Tomado Uno");
  await entrar(page, u);
  await page.goto("/bodega?vista=probados");
  const fila = page.locator(".wine-row", { hasText: "Tomado Uno" }).first();

  // Punto de partida: tomado una vez, sin botellas, y el aviso de qué hace el +.
  await expect(fila).toContainText("Tomado · hoy");
  await expect(fila).toContainText("Sin botellas · tocá + para sumar una al stock");

  // + : suma al stock. El vino NO se va de Ya tomados y la fila lo aclara.
  await fila.getByRole("button", { name: "Sumar una botella" }).click();
  await expect(fila).toContainText("1 botella en tu bodega · tocá − para abrir una");
  await expect(fila.locator(".wine-row__tomado")).toHaveText(/^Tomado · /);
  await expect(page.getByText(/1 botella sumada al stock/)).toBeVisible();
  await expect(page.getByText(/sigue entre los ya tomados/)).toBeVisible();

  // − : abrir la botella. Cuenta como tomado de nuevo y se ve.
  await fila.getByRole("button", { name: "Abrir una botella" }).click();
  await expect(fila).toContainText("Tomado 2 veces · hoy");
  await expect(fila).toContainText("Sin botellas · tocá + para sumar una al stock");
  await expect(page.getByText(/lo tomaste 2 veces/)).toBeVisible();

  const w = await leer(request, u, id);
  expect(w.tasted).toBe(true);
  expect(w.consumptionCount).toBe(2);
  expect(w.quantity).toBe(0);
  expect(w.lots).toHaveLength(2);
});

test("sacar de Ya tomados un vino que abriste pide confirmación; dejarlo no cambia nada", async ({ page, request }) => {
  const u = await crearUsuarioListo(request, "chip");
  const id = await crearVinoTomado(request, u, "Chip Uno");
  await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: 2 } });
  await entrar(page, u);
  await page.goto("/bodega?vista=instock");
  const fila = page.locator(".wine-row", { hasText: "Chip Uno" }).first();
  const chip = fila.locator("button.wine-row__tasted");

  await chip.click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("¿Sacarlo de Ya tomados?");
  await expect(modal).toContainText("Lo abriste 1 vez");
  await modal.getByRole("button", { name: "Dejarlo" }).click();
  expect((await leer(request, u, id)).tasted).toBe(true);

  await chip.click();
  await page.getByRole("dialog").getByRole("button", { name: "Sacarlo" }).click();
  await expect.poll(async () => (await leer(request, u, id)).tasted).toBe(false);
});

test("en la ficha el − cuenta como tomada, igual que en la fila; quitar sin tomarla es otra acción", async ({ page, request }) => {
  const u = await crearUsuarioListo(request, "fic");
  const id = (
    await (
      await request.post(`${API}/wines`, {
        ...con(u.token),
        data: { name: "Ficha Uno", winery: "E2E", varietal: "Malbec", quantity: 3 },
      })
    ).json()
  ).data._id;
  await entrar(page, u);
  await page.goto(`/vino/${id}`);

  await page.getByRole("button", { name: /Abrir una botella: baja el stock/ }).click();
  await expect(page.locator(".wine-detail-tomado")).toHaveText(/^Tomado · hoy$/);
  await expect(page.getByText(/Botella abierta · te quedan 2/)).toBeVisible();
  let w = await leer(request, u, id);
  expect([w.tasted, w.consumptionCount, w.quantity]).toEqual([true, 1, 2]);

  await page.getByRole("button", { name: /Quitar una sin tomarla/ }).click();
  await expect.poll(async () => (await leer(request, u, id)).quantity).toBe(1);
  w = await leer(request, u, id);
  expect(w.consumptionCount, "quitar sin tomarla no suma una toma").toBe(1);
});

test("contar el momento de la botella que abriste no la cuenta como otra toma", async ({ request }) => {
  const u = await crearUsuarioListo(request, "mom");
  const id = (
    await (
      await request.post(`${API}/wines`, {
        ...con(u.token),
        data: { name: "Momento Uno", winery: "E2E", varietal: "Malbec", quantity: 2 },
      })
    ).json()
  ).data._id;
  await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: -1, markTasted: true } });
  await request.post(`${API}/wines/${id}/moments`, { ...con(u.token), data: { notes: "cena con amigos" } });
  expect((await leer(request, u, id)).consumptionCount).toBe(1);
});
