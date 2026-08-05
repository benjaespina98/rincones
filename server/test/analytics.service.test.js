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

/**
 * ── EL DÍA Y LA HORA SON LOS DE ACÁ, NO LOS DE UTC ──────────────────────────
 * Es el error que corre toda la serie sin fallar: con el corte en UTC, lo que
 * pasa entre las 21 y la medianoche de Argentina cae al día siguiente. Alguien
 * mirando el panel a las 23 ve el día de hoy vacío y el de mañana con actividad.
 *
 * Y para el cuadro de horarios —a qué hora está la gente— la hora tiene que ser
 * la del reloj de quien mira: si el pico real es a las 22, tiene que decir 22.
 */

test("el día se corta en el calendario argentino, no en UTC", () => {
  const { hoy } = analytics;
  // 3 de marzo, 23:30 en Argentina = 4 de marzo 02:30 UTC. El día es el 3.
  assert.equal(hoy(new Date("2026-03-04T02:30:00Z")), "2026-03-03");
  // Un minuto después de la medianoche argentina ya es el día siguiente.
  assert.equal(hoy(new Date("2026-03-04T03:01:00Z")), "2026-03-04");
  // Y al mediodía no hay ambigüedad posible.
  assert.equal(hoy(new Date("2026-03-04T15:00:00Z")), "2026-03-04");
});

test("la hora es la del reloj de acá: un pico a las 22 dice 22", () => {
  const { horaDe } = analytics;
  assert.equal(horaDe(new Date("2026-03-04T01:00:00Z")), 22, "01:00 UTC son las 22 de acá");
  assert.equal(horaDe(new Date("2026-03-04T15:00:00Z")), 12);
  assert.equal(horaDe(new Date("2026-03-04T03:00:00Z")), 0, "la medianoche de acá es 0");
});

test("el rango se puede pedir más largo que la retención de los eventos", () => {
  // Los cuadros del panel salen del resumen diario, que no caduca; los eventos
  // crudos viven 180 días. Poder pedir dos años es justamente lo que se destrabó
  // al dejar de depender de ellos.
  assert.ok(analytics.MAX_DIAS > analytics.DIAS_DE_EVENTOS);
  assert.equal(analytics.DIAS_DE_EVENTOS, 180, "es el TTL declarado en el modelo");
});
