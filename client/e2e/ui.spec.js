import { test, expect } from "@playwright/test";
import { crearUsuario } from "./helpers";

test("login por la pantalla, sin errores de consola ni respuestas 5xx", async ({ page, request }) => {
  const u = await crearUsuario(request, "ui");
  const errores = [];
  const fallidas = [];
  page.on("response", (r) => r.status() >= 500 && fallidas.push(`${r.status()} ${r.url()}`));

  await page.goto("/login");
  await page.locator("input#email").fill(u.email);
  await page.locator("input#password").fill(u.password);
  // Antes de ingresar, la app sondea la sesión (/auth/me y /auth/refresh dan 401 a
  // propósito). Los errores de consola cuentan desde el clic.
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  await page.locator("button.auth-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle");

  expect(fallidas).toEqual([]);
  expect(errores.filter((e) => !/favicon|manifest|Sentry/i.test(e))).toEqual([]);
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sobra, "sin scroll horizontal").toBeLessThanOrEqual(0);
});

test("las páginas legales muestran a 200ok.dev y no un nombre personal", async ({ page }) => {
  for (const ruta of ["/privacidad", "/terminos"]) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    const texto = await page.locator("body").innerText();
    expect(texto).toContain("200ok.dev");
    expect(texto).not.toMatch(/Benjam[ií]n|Espina/i);
  }
});
