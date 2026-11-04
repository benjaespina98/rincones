import { test, expect } from "@playwright/test";
import { API, con, crearUsuarioListo, entrar } from "./helpers";

// El layout de escritorio, medido. Cada aserción es algo que se veía mal en 1440px:
// no depende de un screenshot sino de cajas.
const VINOS = [
  { name: "Gran Reserva Malbec", winery: "Bodega del Valle", varietal: "Malbec", type: "red", quantity: 3, vintage: 2019, rating: 4.5 },
  { name: "Chardonnay de Altura", winery: "Finca Alta", varietal: "Chardonnay", type: "white", quantity: 2 },
  { name: "Rosado Joven", winery: "Casa Rosa", varietal: "Malbec", type: "rosé", quantity: 1 },
];

const caja = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });

// Las filas entran con una animación escalonada (transform): medir antes de que termine da posiciones
// distintas para tarjetas que en reposo están en la misma hilera.
const esperarAnimaciones = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));

const preparar = async (request, page) => {
  const u = await crearUsuarioListo(request, "lay");
  const ids = [];
  for (const v of VINOS) ids.push((await (await request.post(`${API}/wines`, { ...con(u.token), data: v })).json()).data._id);
  await request.patch(`${API}/wines/${ids[0]}/stock`, { ...con(u.token), data: { delta: -1, markTasted: true } });
  await entrar(page, u);
  return ids;
};

test.describe("escritorio 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("la ficha alinea el póster con la columna de datos y respeta el margen lateral", async ({ page, request }) => {
    const ids = await preparar(request, page);
    await page.goto(`/vino/${ids[0]}`);
    await page.locator(".wine-detail-body").waitFor();
    const hero = await caja(page, ".wine-detail-hero");
    const cuerpo = await caja(page, ".wine-detail-body");
    expect(Math.abs(hero.top - cuerpo.top), "el póster arranca a la altura de los datos").toBeLessThanOrEqual(8);
    expect(hero.left, "no pega al sidebar").toBeGreaterThanOrEqual(240 + 16);
    expect(cuerpo.left + cuerpo.width, "no llega al borde derecho").toBeLessThanOrEqual(1440 - 16);
  });

  test("Mi Bodega: el selector de vista no se estira y las tarjetas de una hilera miden lo mismo", async ({ page, request }) => {
    await preparar(request, page);
    await page.goto("/bodega");
    await page.locator(".wine-row").first().waitFor();
    await esperarAnimaciones(page);
    expect((await caja(page, ".segmented.bodega-vista")).width).toBeLessThanOrEqual(521);
    const filas = await page.locator(".wines-list .wine-row").evaluateAll((els) =>
      els.map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height) }; })
    );
    const primeraHilera = filas.filter((f) => f.top === filas[0].top);
    expect(primeraHilera.length).toBeGreaterThanOrEqual(2);
    expect(new Set(primeraHilera.map((f) => f.h)).size, "misma altura en la hilera").toBe(1);
  });

  test("Perfil: el título arranca donde arranca la columna", async ({ page, request }) => {
    await preparar(request, page);
    await page.goto("/perfil");
    await page.locator(".profile-page").waitFor();
    const titulo = await caja(page, "h1.app-hero-title");
    const columna = await caja(page, ".profile-page");
    expect(Math.abs(titulo.left - columna.left)).toBeLessThanOrEqual(24);
  });

  test("Descubrí no repite la marca que ya está en el sidebar, pero conserva su h1", async ({ page, request }) => {
    await preparar(request, page);
    await page.goto("/");
    const marca = page.locator(".app-hero-title--marca");
    await expect(marca).toHaveCount(1);
    expect((await caja(page, ".app-hero-title--marca")).width).toBeLessThanOrEqual(1);
  });
});

test.describe("escritorio 1920", () => {
  test.use({ viewport: { width: 1920, height: 900 } });

  test("el botón de volver queda sobre el borde de la columna, no a 160px de ella", async ({ page, request }) => {
    const ids = await preparar(request, page);
    await page.goto(`/vino/${ids[0]}`);
    await page.locator(".wine-detail-hero").waitFor();
    const volver = await caja(page, ".app-topbar__nav-btn");
    const hero = await caja(page, ".wine-detail-hero");
    expect(Math.abs(volver.left - hero.left)).toBeLessThanOrEqual(24);
  });
});

test.describe("escritorio 1440, bordes", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("el botón de volver queda sobre el borde del contenido también a 1440px", async ({ page, request }) => {
    const ids = await preparar(request, page);
    await page.goto(`/vino/${ids[0]}`);
    await page.locator(".wine-detail-hero").waitFor();
    const volver = await caja(page, ".app-topbar__nav-btn");
    const hero = await caja(page, ".wine-detail-hero");
    expect(Math.abs(volver.left - hero.left)).toBeLessThanOrEqual(24);
  });

  test("al desplegar una fila, su vecina no se estira con un hueco vacío", async ({ page, request }) => {
    await preparar(request, page);
    await page.goto("/bodega");
    await page.locator(".wines-list .wine-row").nth(1).waitFor();
    await esperarAnimaciones(page);
    await page.locator(".wines-list .wine-row").first().locator(".wine-row__disclosure").click();
    await esperarAnimaciones(page);
    await page.waitForTimeout(300);
    const filas = await page.locator(".wines-list .wine-row").evaluateAll((els) =>
      els.map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height) }; })
    );
    const hilera = filas.filter((f) => f.top === filas[0].top);
    expect(hilera.length).toBeGreaterThanOrEqual(2);
    expect(hilera[1].h, "la vecina conserva su altura natural").toBeLessThan(hilera[0].h);
  });
});
