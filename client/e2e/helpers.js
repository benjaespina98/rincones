import { execFileSync } from "node:child_process";
import { request as playwrightRequest } from "@playwright/test";

export const API = "http://localhost:4000/api";

const azar = () => Math.random().toString(36).slice(2, 10);

/**
 * Registra una cuenta descartable por la API normal. Sólo datos ficticios.
 * Va en un contexto propio: así la cookie de sesión del registro no se filtra
 * al `request` del test y las pruebas "sin sesión" son sin sesión de verdad.
 */
export async function crearUsuario(_request, etiqueta) {
  const email = `e2e_${etiqueta}_${azar()}@example.test`;
  const password = `Pr!${azar()}Aa9x`;
  const contexto = await playwrightRequest.newContext();
  try {
    const r = await contexto.post(`${API}/auth/register`, {
      data: { email, password, firstName: `E2E${etiqueta}`, birthDate: "1990-05-05" },
    });
    const cuerpo = await r.json();
    // El token ya no viene en el body: sale de la cookie de sesión. Como Bearer, la API lo sigue aceptando.
    const cookie = r.headersArray().find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("authToken="));
    const token = cookie.value.slice("authToken=".length).split(";")[0];
    // La API exige email confirmado para usar el producto.
    verificarEmail(email);
    return { email, password, token, id: cuerpo.data.user.id };
  } finally {
    await contexto.dispose();
  }
}

export const con = (token) => ({ headers: { authorization: `Bearer ${token}` } });

/** Marca la cuenta descartable como verificada (sólo base `test`), para entrar a la app sin el mail. */
export function verificarEmail(email) {
  execFileSync("node", ["scripts/verificarE2E.js", email], { cwd: "../server", stdio: "pipe" });
}

/** Cuenta descartable lista para usar la app, además con el onboarding hecho. */
export async function crearUsuarioListo(request, etiqueta) {
  const u = await crearUsuario(request, etiqueta);
  await request.put(`${API}/users/profile`, { ...con(u.token), data: { onboarded: true } });
  return u;
}

/** Entra por la pantalla de login, como lo haría una persona. */
export async function entrar(page, u) {
  await page.goto("/login");
  await page.locator("input#email").fill(u.email);
  await page.locator("input#password").fill(u.password);
  await page.locator("button.auth-submit").click();
  // Esperar la salida de /login, no la red inactiva: un goto() inmediato cancelaría el login en vuelo.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.waitForLoadState("networkidle");
}
