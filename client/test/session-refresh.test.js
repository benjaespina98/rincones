import { describe, it, expect } from "vitest";
import { debeRenovarSesion } from "../src/services/api";

/**
 * Cuándo hay que renovar la sesión en silencio en vez de mandar al login.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * El token de acceso dura 15 minutos y el refresh 30 días. La idea es que nadie
 * note el vencimiento: se canjea el refresh y la llamada se reintenta.
 *
 * Pero la condición excluía TODAS las rutas que contuvieran "/auth/", y ahí caía
 * `/auth/me` —la llamada con la que la app averigua al arrancar si hay sesión—.
 * Resultado: abrir la app 15 minutos después de la última visita terminaba en el
 * login, con un refresh perfectamente válido guardado. Verificado en el navegador:
 * con la cookie de refresh intacta y el token vencido, recargar /bodega caía en
 * /login; con el arreglo, se queda en /bodega.
 *
 * Es el tipo de bug que el usuario reporta como "la app me desloguea sola" y que
 * desde el código no se ve, porque cada pieza por separado está bien.
 */
describe("debeRenovarSesion", () => {
  it("renueva cuando vence el token de una llamada protegida", () => {
    expect(debeRenovarSesion({ status: 401, url: "/wines" })).toBe(true);
    expect(debeRenovarSesion({ status: 401, url: "/wines/123/stock" })).toBe(true);
    expect(debeRenovarSesion({ status: 401, url: "/promotions/all" })).toBe(true);
  });

  it("renueva también en /auth/me, que es la que hidrata la sesión", () => {
    // Ésta es la que estaba mal y la que hacía que la app pareciera desloguearse.
    expect(debeRenovarSesion({ status: 401, url: "/auth/me" })).toBe(true);
  });

  it("NO renueva en las llamadas que no necesitan token", () => {
    // Un 401 acá significa "credenciales mal", no "venció la sesión". Reintentar
    // sería pedir un refresh para poder loguearse, que no tiene sentido.
    expect(debeRenovarSesion({ status: 401, url: "/auth/login" })).toBe(false);
    expect(debeRenovarSesion({ status: 401, url: "/auth/register" })).toBe(false);
    expect(debeRenovarSesion({ status: 401, url: "/auth/logout" })).toBe(false);
    expect(debeRenovarSesion({ status: 401, url: "/auth/reset-password" })).toBe(false);
    // Y sobre todo el refresh mismo: si falla, la sesión terminó de verdad.
    expect(debeRenovarSesion({ status: 401, url: "/auth/refresh" })).toBe(false);
  });

  it("no reintenta dos veces la misma llamada", () => {
    // Sin esto, un 401 que no es por vencimiento haría un bucle infinito de
    // refresh + reintento.
    expect(debeRenovarSesion({ status: 401, url: "/wines", yaReintentado: true })).toBe(false);
  });

  it("sólo actúa sobre 401", () => {
    for (const status of [200, 400, 403, 404, 429, 500]) {
      expect(debeRenovarSesion({ status, url: "/wines" })).toBe(false);
    }
  });
});
