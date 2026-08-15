const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Los atributos con los que salen las cookies de sesión.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * "Cierro la app, vuelvo un rato después y me pide login otra vez", en
 * navegador y en PWA. No era el service worker (no hay), ni la duración de los
 * tokens: la app en producción le pegaba a la API por su dominio propio, y como
 * `vercel.app` está en la Public Suffix List, `rincones.vercel.app` y
 * `rincones-api.vercel.app` son dos SITIOS distintos. La cookie de refresh era,
 * entonces, una cookie de terceros — bloqueada en Safari, en incógnito y bajo
 * las restricciones nuevas de Chrome.
 *
 * El arreglo de fondo está del lado del cliente (ver `resolverBaseUrl`): las
 * llamadas salen por el mismo origen. Esto de acá es la otra mitad: una vez que
 * la API es del mismo origen, `SameSite=None` dejó de hacer falta y pasó a ser
 * sólo superficie de CSRF y la categoría de cookie con la vida más recortable.
 *
 * Lo que se prueba: que el refresh salga con fecha de expiración (una cookie de
 * sesión moriría al cerrar el navegador, que es literalmente el bug reportado),
 * que sea httpOnly, y que el default no vuelva a ser `none` sin que alguien lo
 * pida explícitamente.
 */

const cargarServicio = (env) => {
  const previo = { ...process.env };
  Object.assign(process.env, env);
  delete require.cache[require.resolve("../src/services/session.service")];
  const sessions = require("../src/services/session.service");
  return {
    sessions,
    restaurar: () => {
      process.env = previo;
      delete require.cache[require.resolve("../src/services/session.service")];
    },
  };
};

/** Un `res` mínimo que sólo anota lo que le pidieron guardar. */
const fakeRes = () => {
  const cookies = {};
  return {
    cookies,
    cookie: (nombre, valor, opciones) => {
      cookies[nombre] = { valor, opciones };
    },
    clearCookie: (nombre, opciones) => {
      cookies[nombre] = { valor: "", opciones, borrada: true };
    },
  };
};

test("en producción el refresh sobrevive a cerrar el navegador y no viaja cross-site", () => {
  const { sessions, restaurar } = cargarServicio({
    NODE_ENV: "production",
    COOKIE_SAMESITE: "",
    COOKIE_DOMAIN: "",
  });

  try {
    const res = fakeRes();
    const vence = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    sessions.setRefreshCookie(res, "token-de-prueba", vence);

    const { opciones } = res.cookies.refreshToken;

    // Sin `expires` sería una cookie de sesión: se borraría al cerrar el
    // navegador, que es exactamente el síntoma que se reportó.
    assert.deepEqual(opciones.expires, vence);
    assert.equal(opciones.httpOnly, true, "el refresh nunca puede quedar al alcance de un script");
    assert.equal(opciones.secure, true);
    assert.equal(opciones.sameSite, "lax", "la API es del mismo origen: `none` sobra y abre CSRF");
    assert.equal(opciones.path, "/api/auth", "sólo viaja a la ruta que la usa");
    assert.equal(opciones.domain, undefined, "sin COOKIE_DOMAIN la cookie queda atada al host");
  } finally {
    restaurar();
  }
});

test("el access token va en una cookie corta, del mismo largo que el token", () => {
  const { sessions, restaurar } = cargarServicio({ NODE_ENV: "production", COOKIE_SAMESITE: "" });

  try {
    const res = fakeRes();
    sessions.setAuthCookie(res, "jwt-de-prueba");

    const { opciones } = res.cookies.authToken;
    assert.equal(opciones.maxAge, 15 * 60 * 1000);
    assert.equal(opciones.httpOnly, true);
    assert.equal(opciones.sameSite, "lax");
  } finally {
    restaurar();
  }
});

test("`none` sigue disponible, pero hay que pedirlo a mano (front y API en sitios distintos)", () => {
  const { sessions, restaurar } = cargarServicio({
    NODE_ENV: "production",
    COOKIE_SAMESITE: "none",
  });

  try {
    const res = fakeRes();
    sessions.setAuthCookie(res, "jwt");
    assert.equal(res.cookies.authToken.opciones.sameSite, "none");
    // `none` sin `secure` lo rechaza el navegador entero: van siempre juntos.
    assert.equal(res.cookies.authToken.opciones.secure, true);
  } finally {
    restaurar();
  }
});

test("borrar la sesión usa los MISMOS atributos, o el navegador no borra nada", () => {
  // Una cookie sólo se borra si el `Set-Cookie` de borrado coincide en path (y
  // domain). Si `clearAuthCookies` no repitiera `path: /api/auth`, el refresh
  // quedaría vivo después de cerrar sesión.
  const { sessions, restaurar } = cargarServicio({ NODE_ENV: "production", COOKIE_SAMESITE: "" });

  try {
    const res = fakeRes();
    sessions.clearAuthCookies(res);

    assert.equal(res.cookies.authToken.opciones.path, "/");
    assert.equal(res.cookies.refreshToken.opciones.path, "/api/auth");
    assert.equal(res.cookies.refreshToken.opciones.sameSite, "lax");
  } finally {
    restaurar();
  }
});

test("en desarrollo la cookie no exige HTTPS", () => {
  const { sessions, restaurar } = cargarServicio({ NODE_ENV: "development", COOKIE_SAMESITE: "" });

  try {
    const res = fakeRes();
    sessions.setAuthCookie(res, "jwt");
    assert.equal(res.cookies.authToken.opciones.secure, false);
    assert.equal(res.cookies.authToken.opciones.sameSite, "lax");
  } finally {
    restaurar();
  }
});
