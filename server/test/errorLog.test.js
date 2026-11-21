const test = require("node:test");
const assert = require("node:assert/strict");
const ErrorLog = require("../src/models/errorLog.model");
const adminController = require("../src/controllers/admin.controller");
const { recordError } = require("../src/services/errorLog.service");

/**
 * ── LOS ERRORES DEL SERVIDOR, AHORA CON UN LUGAR DONDE QUEDAR ────────────────
 *
 * Hasta este cambio, un 500 de verdad —una API key vencida, un `AbortError`
 * de Gemini, lo que sea— sólo se veía en la consola de la terminal mientras
 * el server estaba corriendo. Ni se guardaba, ni había forma de consultarlo
 * después desde el panel. `recordError` es el escritor (best-effort, igual
 * que `logAdminAction`); `getErrorLogs` es lo que el tab de Logs consulta.
 */

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test("recordError nunca lanza, ni cuando falla el guardado", async () => {
  const original = ErrorLog.create;
  ErrorLog.create = async () => { throw new Error("Mongo caído"); };
  try {
    // Si esto lanza, el test falla solo — no hace falta un try/catch acá:
    // es justo lo que se está probando que NO pase.
    await recordError({ error: new Error("boom"), req: { method: "GET", originalUrl: "/api/x" } });
  } finally {
    ErrorLog.create = original;
  }
});

test("recordError guarda mensaje, ruta y método, recortados a un tamaño razonable", async () => {
  const original = ErrorLog.create;
  let guardado = null;
  ErrorLog.create = async (doc) => { guardado = doc; return doc; };
  try {
    const error = new Error("x".repeat(1000));
    error.stack = "y".repeat(9000);
    await recordError({
      error,
      req: { method: "POST", originalUrl: "/api/sommelier/ask", user: { id: "u1" } },
      statusCode: 503,
    });
    assert.equal(guardado.method, "POST");
    assert.equal(guardado.route, "/api/sommelier/ask");
    assert.equal(guardado.statusCode, 503);
    assert.equal(guardado.userId, "u1");
    // Recortado: un stack de Mongo o de undici puede ser enorme, y esto es
    // para diagnosticar, no para archivar el error entero sin límite.
    assert.ok(guardado.message.length <= 500);
    assert.ok(guardado.stack.length <= 4000);
  } finally {
    ErrorLog.create = original;
  }
});

test("getErrorLogs arma el filtro de fecha con el día completo del 'hasta'", async () => {
  const original = { find: ErrorLog.find, count: ErrorLog.countDocuments };
  let filtroUsado = null;
  const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
  ErrorLog.find = (f) => { filtroUsado = f; return chain; };
  ErrorLog.countDocuments = async () => 0;

  try {
    const res = responder();
    await adminController.getErrorLogs(
      { query: { from: "2026-03-01", to: "2026-03-05" } },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 200);
    assert.ok(filtroUsado.createdAt.$gte instanceof Date);
    assert.ok(filtroUsado.createdAt.$lte instanceof Date);
    // El "hasta" tiene que cubrir el día entero: medianoche sola dejaría
    // afuera todo lo que pasó esa misma tarde.
    // El día se corta en calendario argentino (UTC-3), igual que las métricas: el 5/3 termina a las
    // 23:59:59.999 de Argentina = 02:59:59.999 UTC del 6/3. Se compara en UTC para que el test no
    // dependa de la zona horaria de la máquina (en el CI es UTC).
    assert.equal(filtroUsado.createdAt.$lte.toISOString(), "2026-03-06T02:59:59.999Z");
    assert.equal(filtroUsado.createdAt.$gte.toISOString(), "2026-03-01T03:00:00.000Z");
  } finally {
    ErrorLog.find = original.find;
    ErrorLog.countDocuments = original.count;
  }
});

test("getErrorLogs busca por mensaje o ruta, sin romper con texto raro", async () => {
  const original = { find: ErrorLog.find, count: ErrorLog.countDocuments };
  let filtroUsado = null;
  const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
  ErrorLog.find = (f) => { filtroUsado = f; return chain; };
  ErrorLog.countDocuments = async () => 0;

  try {
    const res = responder();
    // Un query con caracteres de regex (paréntesis, +) no puede tirar la
    // consulta abajo — ver `escapeRegex`.
    await adminController.getErrorLogs({ query: { q: "AbortError (timeout)+" } }, res, (e) => { throw e; });
    assert.equal(res.statusCode, 200);
    assert.equal(filtroUsado.$or.length, 2);
  } finally {
    ErrorLog.find = original.find;
    ErrorLog.countDocuments = original.count;
  }
});
