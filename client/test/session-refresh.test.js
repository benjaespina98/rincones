import { describe, it, expect, afterEach } from "vitest";
import api, { debeRenovarSesion, resolverBaseUrl, setAuthToken } from "../src/services/api";

/**
 * Contra dónde salen las llamadas en producción.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * Es el "se me cierra la sesión sola después de un rato", y no era del refresh
 * ni del AuthContext: era que en producción la app le pegaba a
 * `https://rincones-api.vercel.app/api` en vez de a `/api`. `vercel.app` está
 * en la Public Suffix List, así que ese host y el del front son dos SITIOS
 * distintos y las cookies de sesión pasaban a ser de terceros — bloqueadas en
 * Safari, en incógnito y bajo las restricciones nuevas de Chrome. El login
 * andaba igual (el token de acceso va por header, desde localStorage) y recién
 * al vencer, 15 minutos después, el refresh se quedaba sin cookie y te sacaba.
 *
 * La condición vieja miraba si la URL configurada "parecía local". Eso no es lo
 * que importa: lo que importa es si es el mismo origen que la página.
 */
describe("resolverBaseUrl", () => {
  const PROD = "https://rincones.vercel.app";

  it("en producción ignora una URL de otro origen: rompería la cookie de sesión", () => {
    // Exactamente lo que estaba cargado en Vercel y lo que se verificó en el
    // bundle publicado.
    expect(
      resolverBaseUrl({
        configurada: "https://rincones-api.vercel.app/api",
        origen: PROD,
        produccion: true,
      })
    ).toBe("/api");
  });

  it("en producción sin variable configurada usa el rewrite del mismo origen", () => {
    expect(resolverBaseUrl({ configurada: "", origen: PROD, produccion: true })).toBe("/api");
  });

  it("en producción acepta una URL que SÍ es del mismo origen", () => {
    expect(
      resolverBaseUrl({ configurada: `${PROD}/api`, origen: PROD, produccion: true })
    ).toBe(`${PROD}/api`);
    expect(resolverBaseUrl({ configurada: "/api", origen: PROD, produccion: true })).toBe("/api");
  });

  it("en producción una URL rota no deja la app sin base", () => {
    expect(resolverBaseUrl({ configurada: "no-es-una-url", origen: PROD, produccion: true })).toBe("/api");
  });

  it("una variable de desarrollo olvidada en el panel tampoco rompe producción", () => {
    // El caso que la condición vieja sí cubría; no se pierde.
    expect(
      resolverBaseUrl({ configurada: "http://localhost:4000/api", origen: PROD, produccion: true })
    ).toBe("/api");
  });

  it("en desarrollo manda la variable, y sin ella el server local", () => {
    expect(
      resolverBaseUrl({ configurada: "http://localhost:4000/api", origen: "http://localhost:5173", produccion: false })
    ).toBe("http://localhost:4000/api");
    expect(
      resolverBaseUrl({ configurada: "", origen: "http://localhost:5173", produccion: false })
    ).toBe("http://localhost:4000/api");
  });
});

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

/**
 * Qué error le llega a quien llamó cuando el refresh, disparado por un 401 en
 * `/auth/me`, no pudo contestar.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * El interceptor descartaba el motivo por el que había fallado el refresh y
 * dejaba pasar el 401 ORIGINAL de `/auth/me`. Para `AuthContext.hydrateUser`
 * (que sí distingue "el server dijo que no" de "no pudimos preguntar", ver
 * `esFalloDeRed`) un 401 es una respuesta definitiva: cierra la sesión. Así que
 * un refresh que se caía por timeout o por un arranque en frío del server —
 * justo lo esperable al reabrir la PWA después de un rato con la app cerrada a
 * la fuerza— terminaba deslogueando con el refresh (y la sesión) intactos.
 */
describe("interceptor de refresh: qué error se propaga si el refresh no contesta", () => {
  afterEach(() => {
    api.defaults.adapter = undefined;
    setAuthToken(null);
  });

  const responderCon = (respuestas) => async (config) => {
    const paso = respuestas.shift();
    if (paso.status) {
      const error = new Error(`Request failed with status ${paso.status}`);
      error.config = config;
      error.response = { status: paso.status, data: {}, headers: {}, config };
      throw error;
    }
    // Sin `response`: simula timeout/sin red, igual que un axios real sin respuesta.
    const error = new Error(paso.errorMessage || "timeout of 12000ms exceeded");
    error.config = config;
    throw error;
  };

  it("el refresh sin respuesta (red/timeout) propaga SU error, no el 401 de /auth/me", async () => {
    setAuthToken("token-vencido");
    api.defaults.adapter = responderCon([
      { status: 401 }, // GET /auth/me
      { errorMessage: "timeout of 25000ms exceeded" }, // POST /auth/refresh: sin respuesta
    ]);

    expect.assertions(2);
    try {
      await api.get("/auth/me");
    } catch (error) {
      expect(error.message).toMatch(/timeout/);
      expect(error.response).toBeUndefined();
    }
  });

  it("si el refresh SÍ contesta 401, ese es el error que se propaga (sesión terminada de verdad)", async () => {
    setAuthToken("token-vencido");
    api.defaults.adapter = responderCon([
      { status: 401 }, // GET /auth/me
      { status: 401 }, // POST /auth/refresh: la sesión terminó de verdad
    ]);

    await expect(api.get("/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});
