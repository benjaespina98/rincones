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
  await expect(fila).toContainText("Sin botellas · con + sumás una al stock");

  // + : suma al stock. El vino NO se va de Ya tomados y la fila lo aclara.
  await fila.getByRole("button", { name: "Sumar una botella" }).click();
  await expect(fila).toContainText("1 botella en tu bodega · con − abrís una");
  await expect(fila).toContainText("Tomado");
  await expect(page.getByText(/1 botella sumada al stock/)).toBeVisible();
  await expect(page.getByText(/sigue entre los ya tomados/)).toBeVisible();

  // − : abrir la botella. Cuenta como tomado de nuevo y se ve.
  await fila.getByRole("button", { name: "Tomé una botella" }).click();
  await expect(fila).toContainText("Tomado 2 veces · hoy");
  await expect(fila).toContainText("Sin botellas · con + sumás una al stock");
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
