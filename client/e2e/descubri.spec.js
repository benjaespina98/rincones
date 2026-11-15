import { test, expect } from "@playwright/test";
import { API, con, crearUsuarioListo, entrar } from "./helpers";

// La tarjeta de sugerencia de Descubrí: sus motivos, que no use fotos ajenas ni porcentaje, y que el segundo
// arranque no espere a la API (el set es estable todo el día y se guarda en el dispositivo).
const LENTA_MS = 2500;

const prepararConHistorial = async (request) => {
  const u = await crearUsuarioListo(request, "desc");
  for (const [i, nombre] of ["Uno", "Dos", "Tres", "Cuatro"].entries()) {
    const r = await request.post(`${API}/wines`, {
      ...con(u.token),
      data: { name: `Malbec ${nombre}`, winery: `Bodega ${nombre}`, varietal: "Malbec", type: "red", region: "Mendoza", quantity: 1, rating: i % 2 ? 4 : 5 },
    });
    const id = (await r.json()).data._id;
    await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: -1, markTasted: true } });
  }
  return u;
};

test("la tarjeta explica por qué con motivos cortos, sin porcentaje ni foto de otra persona", async ({ page, request }) => {
  const u = await prepararConHistorial(request);
  // Respuesta fija de la API: lo que se prueba es cómo se dibuja, no qué vino elige el servidor ese día.
  await page.route("**/api/catalog/featured", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "e2e-1",
            name: "Otro Loco Más",
            winery: "Mosquita Muerta Wines",
            varietal: "Malbec",
            type: "red",
            region: "Valle de Uco, Mendoza",
            image: "https://res.cloudinary.com/x/image/upload/foto-ajena.jpg",
            motivo: {
              modo: "afinidad",
              coincidencia: 99,
              razones: ["Como tomaste Malbec, te recomiendo este vino"],
              motivos: ["Tomaste Malbec", "Región que tomás seguido: Mendoza"],
            },
          },
        ],
      },
    })
  );
  await entrar(page, u);
  await page.goto("/");
  const tarjeta = page.locator(".spotlight").first();
  await expect(tarjeta.locator(".spotlight__name")).toHaveText("Otro Loco Más");

  expect(await tarjeta.locator(".spotlight__eyebrow").innerText()).toBe("Para vos");
  expect(await tarjeta.locator(".spotlight__motivo").allInnerTexts()).toEqual(["Tomaste Malbec", "Región que tomás seguido: Mendoza"]);
  expect(await tarjeta.innerText(), "ningún porcentaje de coincidencia").not.toMatch(/[0-9]+ ?%/);
  expect(await tarjeta.locator(".spotlight__art img").count(), "botella dibujada, no la foto ajena").toBe(0);
  expect(await tarjeta.locator(".spotlight__art svg").count()).toBeGreaterThanOrEqual(1);
});

test("un arranque en frío pinta la tarjeta sin volver a pedirla a la API", async ({ page, request, context }) => {
  const u = await prepararConHistorial(request);
  // La API tarda: si el arranque en frío la esperara, la tarjeta no aparecería hasta pasados LENTA_MS.
  await context.route("**/api/catalog/featured", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, LENTA_MS));
    await route.continue();
  });
  await entrar(page, u);

  // Primer arranque: pide el set a la API (lenta) y lo guarda en el dispositivo.
  await page.goto("/");
  await expect(page.locator(".spotlight .spotlight__name").first()).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("rincones_featured")).length))
    .toBe(1);

  // Arranque en frío de verdad: una página NUEVA del mismo contexto comparte el localStorage pero no la
  // sessionStorage ni la memoria, como abrir la app otra vez. (Un reload conserva la sessionStorage y no prueba esto.)
  const fria = await context.newPage();
  const pedidos = [];
  fria.on("request", (r) => r.url().includes("/api/catalog/featured") && pedidos.push(r.url()));
  await fria.goto("/");
  await expect(fria.locator(".spotlight .spotlight__name").first()).toBeVisible({ timeout: 20000 });
  expect(pedidos, "el arranque en frío no pidió el set a la API").toEqual([]);
  await expect(fria.locator(".spotlight--skeleton")).toHaveCount(0);
});
