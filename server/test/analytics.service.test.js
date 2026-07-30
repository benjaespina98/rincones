const test = require("node:test");
const assert = require("node:assert/strict");
const analytics = require("../src/services/analytics.service");

/**
 * Las dos reglas del analytics que, si se rompen, hacen que los números mientan
 * sin que nada avise:
 *
 *  - los ids salen de las rutas (si no, la tabla de pantallas es una fila por
 *    vino y no responde nada);
 *  - un visitante es un hash anónimo estable, y NO la IP.
 */

test("las rutas pierden los ids: /vino/<objectid> agrupa como /vino/:id", () => {
  const { normalizarPath } = analytics;

  assert.equal(normalizarPath("/vino/687f2a1b4c3d2e1f0a9b8c7d"), "/vino/:id");
  assert.equal(normalizarPath("/vino/12345"), "/vino/:id");
  assert.equal(normalizarPath("/"), "/");
  assert.equal(normalizarPath(""), "/");
  // Los parámetros de búsqueda se van: pueden traer lo que la persona escribió.
  assert.equal(normalizarPath("/bodega?filter=favorites"), "/bodega");
  assert.equal(normalizarPath("/bodega#seccion"), "/bodega");
  // Mayúsculas normalizadas, para que /Bodega y /bodega no sean dos filas.
  assert.equal(normalizarPath("/Bodega"), "/bodega");
  // Una ruta con id en el medio también.
  assert.equal(
    normalizarPath("/wines/687f2a1b4c3d2e1f0a9b8c7d/moments"),
    "/wines/:id/moments"
  );
});

test("el visitante se identifica por un hash anónimo, no por su IP", () => {
  const { identificar } = analytics;

  const pedido = (ip, ua = "Mozilla/5.0 (iPhone)") => ({
    headers: { "x-forwarded-for": ip, "user-agent": ua },
    ip,
  });

  const a = identificar(pedido("200.1.2.3"));
  const b = identificar(pedido("200.1.2.3"));
  const c = identificar(pedido("200.9.9.9"));

  // Estable: la misma persona cuenta una sola vez.
  assert.equal(a.visitorHash, b.visitorHash);
  // Distinta conexión, distinto visitante.
  assert.notEqual(a.visitorHash, c.visitorHash);

  // Y lo que importa: la IP NO está en lo que se guarda. Es toda la razón por la
  // que esto no necesita consentimiento de cookies.
  assert.ok(!a.visitorHash.includes("200.1.2.3"));
  assert.ok(!a.sessionHash.includes("200.1.2.3"));
  assert.match(a.visitorHash, /^[0-9a-f]{32}$/);

  // El tipo de pantalla se deduce del user-agent, sin guardarlo.
  assert.equal(a.device, "mobile");
  assert.equal(identificar(pedido("200.1.2.3", "Mozilla/5.0 (Windows NT 10.0)")).device, "desktop");
  assert.equal(identificar({ headers: {}, ip: "1.1.1.1" }).device, "unknown");
});

test("la sesión es distinta del visitante, y deriva de él", () => {
  const { identificar } = analytics;
  const req = { headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "x" }, ip: "1.2.3.4" };

  const { visitorHash, sessionHash } = identificar(req);
  assert.notEqual(visitorHash, sessionHash, "no pueden ser el mismo valor");
  assert.match(sessionHash, /^[0-9a-f]{32}$/);
});
