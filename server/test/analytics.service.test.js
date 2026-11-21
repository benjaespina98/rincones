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

test("la IP sale de req.ip, no de la cabecera x-forwarded-for que escribe el cliente", () => {
  const { identificar } = analytics;
  const base = { "user-agent": "Mozilla/5.0 (iPhone)" };
  const a = identificar({ headers: { ...base, "x-forwarded-for": "9.9.9.9" }, ip: "200.1.2.3" });
  const b = identificar({ headers: { ...base, "x-forwarded-for": "8.8.8.8" }, ip: "200.1.2.3" });
  assert.equal(a.visitorHash, b.visitorHash, "falsear la cabecera no cambia quién es el visitante");
});

test("el token del informe no queda en el path: /informe/<token> agrupa como /informe/:token", () => {
  const { normalizarPath } = analytics;
  assert.equal(normalizarPath("/informe/AbC123-secretoLargo_xyz"), "/informe/:token");
  assert.equal(normalizarPath("/informe/abc?x=1"), "/informe/:token");
  assert.ok(!normalizarPath("/informe/SECRETO").includes("secreto"));
});

test("el path tiene largo máximo y charset acotado", () => {
  const { normalizarPath } = analytics;
  assert.equal(normalizarPath("/" + "a".repeat(500)), "/otro");
  assert.equal(normalizarPath("/<script>alert(1)</script>"), "/otro");
  assert.equal(normalizarPath("/a b"), "/otro");
  assert.equal(normalizarPath("/vino/:id"), "/vino/:id");
});

test("el type es una forma estricta y corta", () => {
  const { TIPO_VALIDO } = analytics;
  for (const ok of ["pageview", "wine_added", "sommelier_ask", "cafecito_click"]) assert.ok(TIPO_VALIDO.test(ok), ok);
  for (const mal of ["", "Pageview", "a.b", "a$b", "x".repeat(41), "a b", "$set", "1abc", "a:b"]) {
    assert.ok(!TIPO_VALIDO.test(mal), mal);
  }
});

test("el referrer que manda el client es lo que cuenta, y sólo como host", () => {
  const { hostReferrer } = analytics;
  assert.equal(hostReferrer("https://www.instagram.com/p/abc?x=1"), "www.instagram.com");
  assert.equal(hostReferrer("javascript:alert(1)"), "");
  assert.equal(hostReferrer("no es url"), "");
});

test("track cuenta el origen una vez por visita, no por evento del lote", () => {
  const { armarIncrementos } = analytics;
  const docs = [
    { type: "pageview", path: "/", referrer: "www.instagram.com" },
    { type: "wine_added", path: "/", referrer: "" },
    { type: "pageview", path: "/bodega", referrer: "" },
  ];
  const inc = armarIncrementos({ documentos: docs, device: "mobile", existentes: {}, hora: 10 });
  assert.equal(inc["byReferrer.www_instagram_com"], 1, "1, no documentos.length (3)");
  assert.equal(inc.views, 2);
  assert.equal(inc["byType.pageview"], 2);
});

test("los mapas del día tienen tope de claves: lo que pasa se junta en 'otro'", () => {
  const { armarIncrementos, MAX_CLAVES_TYPE, MAX_CLAVES_PATH } = analytics;
  const existentes = {
    byType: Object.fromEntries(Array.from({ length: MAX_CLAVES_TYPE }, (_, i) => [`t${i}`, 1])),
    byPath: Object.fromEntries(Array.from({ length: MAX_CLAVES_PATH }, (_, i) => [`/p${i}`, 1])),
  };
  const inc = armarIncrementos({
    documentos: [
      { type: "nuevo_tipo", path: "/nueva" },
      { type: "pageview", path: "/nueva" },
      { type: "t3", path: "" },
    ],
    device: "desktop",
    existentes,
    hora: 3,
  });
  // "pageview" es un tipo legítimo conocido: no se desplaza a "otro" aunque el mapa esté lleno.
  assert.equal(inc["byType.otro"], 1);
  assert.equal(inc["byType.pageview"], 1);
  assert.equal(inc["byType.t3"], 1, "una clave existente sigue sumando");
  assert.equal(inc["byPath.otro"], 1);
  assert.equal(inc["byType.nuevo_tipo"], undefined);
});
