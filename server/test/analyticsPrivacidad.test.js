const test = require("node:test");
const { beforeEach } = test;
const assert = require("node:assert/strict");
const AnalyticsEvent = require("../src/models/analyticsEvent.model");
const AnalyticsDaily = require("../src/models/analyticsDaily.model");
const analytics = require("../src/services/analytics.service");

// El cierre de días se acuerda del último día que corrió: cada test arranca sin memoria.
beforeEach(() => {
  analytics._reiniciarCierre();
  analytics._reiniciarTopesIp();
});

/**
 * Baja de cuenta y analytics: el hash de quien pidió irse no puede quedar en el resumen diario, y el
 * total del período tiene que coincidir con la serie diaria.
 *
 * No hay Mongo en los tests, así que acá hay un mini evaluador del subconjunto de operadores de
 * agregación que usan los pipelines de `olvidarUsuario` y `cerrarDiasAnteriores`. Es lo que permite
 * probar la regla completa (qué queda en cada día) y no sólo la forma de la consulta.
 */

const ev = (e, d, v = {}) => {
  if (typeof e === "string") {
    if (e.startsWith("$$")) return v[e.slice(2)];
    if (e.startsWith("$")) return d[e.slice(1)];
    return e;
  }
  if (Array.isArray(e)) return e.map((x) => ev(x, d, v));
  if (e && typeof e === "object") {
    const [op] = Object.keys(e);
    const a = e[op];
    switch (op) {
      case "$ifNull": {
        const r = ev(a[0], d, v);
        return r === undefined || r === null ? ev(a[1], d, v) : r;
      }
      case "$size": return ev(a, d, v).length;
      case "$gt": { const [x, y] = ev(a, d, v); return x > y; }
      case "$eq": { const [x, y] = ev(a, d, v); return x === y; }
      case "$cond": return ev(a[0], d, v) ? ev(a[1], d, v) : ev(a[2], d, v);
      case "$not": return !ev(a[0], d, v);
      case "$in": { const [x, l] = ev(a, d, v); return l.includes(x); }
      case "$filter": return ev(a.input, d, v).filter((item) => ev(a.cond, d, { ...v, this: item }));
      case "$max": return Math.max(...ev(a, d, v));
      case "$subtract": { const [x, y] = ev(a, d, v); return x - y; }
      default: return e;
    }
  }
  return e;
};

const aplicarPipeline = (doc, etapas) => {
  let actual = { ...doc };
  for (const etapa of etapas) {
    const base = { ...actual };
    for (const [k, expr] of Object.entries(etapa.$set)) actual[k] = ev(expr, base);
  }
  return actual;
};

/** Una "base" en memoria con los métodos que usan las funciones probadas. */
const montarBase = ({ eventos, dias }) => {
  // `opciones`: lo que recibió cada update. `fallas`: cuántas veces más tiene que fallar cada operación.
  const db = {
    eventos: [...eventos],
    dias: new Map(dias.map((d) => [d.day, { ...d }])),
    opciones: [],
    fallas: { deleteMany: 0, updateOne: 0, updateMany: 0 },
  };
  const fallar = (op) => {
    if (db.fallas[op] > 0) {
      db.fallas[op] -= 1;
      throw new Error(`${op} caído`);
    }
  };
  // Lo que hace Mongoose 9 con un update en forma de pipeline: sin `updatePipeline: true` lo rechaza.
  const exigirOpcion = (pipeline, opts) => {
    db.opciones.push(opts);
    if (Array.isArray(pipeline) && opts?.updatePipeline !== true) {
      throw new Error("Cannot pass an array to query updates unless the `updatePipeline` option is set");
    }
  };
  const originales = {
    find: AnalyticsEvent.find,
    deleteMany: AnalyticsEvent.deleteMany,
    updateOne: AnalyticsDaily.updateOne,
    updateMany: AnalyticsDaily.updateMany,
  };
  const coincide = (e, f) =>
    Object.entries(f).every(([k, cond]) => {
      if (k === "$or") return cond.some((c) => coincide(e, c));
      if (cond && typeof cond === "object" && cond.$in) return cond.$in.includes(e[k]);
      return String(e[k]) === String(cond);
    });
  AnalyticsEvent.find = (f) => ({ select: () => ({ lean: async () => db.eventos.filter((e) => coincide(e, f)) }) });
  AnalyticsEvent.deleteMany = async (f) => {
    fallar("deleteMany");
    const antes = db.eventos.length;
    db.eventos = db.eventos.filter((e) => !coincide(e, f));
    return { deletedCount: antes - db.eventos.length };
  };
  AnalyticsDaily.updateOne = async ({ day }, pipeline, opts) => {
    exigirOpcion(pipeline, opts);
    fallar("updateOne");
    db.dias.set(day, aplicarPipeline(db.dias.get(day), pipeline));
  };
  AnalyticsDaily.updateMany = async (filtro, pipeline, opts) => {
    exigirOpcion(pipeline, opts);
    fallar("updateMany");
    for (const [day, doc] of db.dias) {
      if (day < filtro.day.$lt && doc.closed !== true) db.dias.set(day, aplicarPipeline(doc, pipeline));
    }
  };
  db.restore = () => {
    AnalyticsEvent.find = originales.find;
    AnalyticsEvent.deleteMany = originales.deleteMany;
    AnalyticsDaily.updateOne = originales.updateOne;
    AnalyticsDaily.updateMany = originales.updateMany;
  };
  // Lo que haría `getSummary` para los únicos del período, para chequear la coincidencia.
  db.unicosDelPeriodo = () => new Set(db.eventos.map((e) => e.visitorHash)).size;
  db.mejorDia = () => Math.max(0, ...[...db.dias.values()].map((d) => d.visitorCount));
  return db;
};

const ev1 = (userId, day, visitorHash, sessionHash) => ({ userId, day, visitorHash, sessionHash });

test("planearOlvido junta, por día, los hashes de la persona y las sesiones de ESOS hashes", () => {
  const propios = [ev1("u", "2026-11-01", "H1", "S1"), ev1("u", "2026-11-01", "H1", "S2"), ev1("u", "2026-11-02", "H1", "S3")];
  const delosHashes = [
    ...propios,
    ev1(null, "2026-11-01", "H1", "S9"), // anónimo, mismo hash, mismo día: también se va
    ev1(null, "2026-11-01", "H2", "SX"), // otra persona: NO
  ];
  const plan = analytics.planearOlvido(propios, delosHashes);
  assert.deepEqual([...plan.keys()].sort(), ["2026-11-01", "2026-11-02"]);
  assert.deepEqual([...plan.get("2026-11-01").hashes], ["H1"]);
  assert.deepEqual([...plan.get("2026-11-01").sessions].sort(), ["S1", "S2", "S9"]);
  assert.ok(!plan.get("2026-11-01").sessions.has("SX"));
});

test("al borrar la cuenta el hash sale del día abierto y del cerrado, y el período coincide con los diarios", async () => {
  // Día 1 ya cerrado (sólo contadores: 3 visitantes, 4 sesiones, 1 logueado). Día 2 abierto con sets.
  const db = montarBase({
    eventos: [
      ev1("A", "2026-11-01", "HA", "SA1"), // la persona que se va
      ev1(null, "2026-11-01", "HB", "SB1"),
      ev1(null, "2026-11-01", "HC", "SC1"),
      ev1("A", "2026-11-02", "HA", "SA2"),
      ev1(null, "2026-11-02", "HA", "SA3"), // anónimo del mismo hash: se va con ella
      ev1(null, "2026-11-02", "HB", "SB2"),
    ],
    dias: [
      { day: "2026-11-01", closed: true, visitors: [], sessionHashes: [], loggedInVisitors: [], visitorCount: 3, sessions: 4, loggedIn: 1 },
      {
        day: "2026-11-02",
        closed: false,
        visitors: ["HA", "HB"],
        sessionHashes: ["SA2", "SA3", "SB2"],
        loggedInVisitors: ["HA"],
        visitorCount: 2,
        sessions: 3,
        loggedIn: 1,
      },
    ],
  });
  try {
    const r = await analytics.olvidarUsuario("A");
    assert.equal(r.days, 2);

    const d1 = db.dias.get("2026-11-01");
    assert.equal(d1.visitorCount, 2, "día cerrado: se descuenta 1 visitante");
    assert.equal(d1.sessions, 3, "día cerrado: se descuenta su sesión");
    assert.equal(d1.loggedIn, 0);

    const d2 = db.dias.get("2026-11-02");
    assert.deepEqual(d2.visitors, ["HB"], "día abierto: el hash sale del set");
    assert.deepEqual(d2.sessionHashes, ["SB2"]);
    assert.deepEqual(d2.loggedInVisitors, []);
    assert.equal(d2.visitorCount, 1);
    assert.equal(d2.sessions, 1);
    assert.equal(d2.loggedIn, 0);

    // Ni un rastro en los eventos...
    assert.ok(!db.eventos.some((e) => e.visitorHash === "HA" || String(e.userId) === "A"));
    // ...y el período (hashes distintos sobre los eventos) no es menor que el mejor día.
    assert.equal(db.unicosDelPeriodo(), 2);
    assert.ok(db.unicosDelPeriodo() >= db.mejorDia());
  } finally {
    db.restore();
  }
});

test("los contadores de un día cerrado no bajan de cero", async () => {
  const db = montarBase({
    eventos: [ev1("A", "2026-11-01", "HA", "S1"), ev1("A", "2026-11-01", "HA", "S2")],
    dias: [{ day: "2026-11-01", closed: true, visitors: [], sessionHashes: [], loggedInVisitors: [], visitorCount: 0, sessions: 1, loggedIn: 0 }],
  });
  try {
    await analytics.olvidarUsuario("A");
    const d = db.dias.get("2026-11-01");
    assert.equal(d.visitorCount, 0);
    assert.equal(d.sessions, 0);
    assert.equal(d.loggedIn, 0);
  } finally {
    db.restore();
  }
});

test("sin eventos propios no se toca el resumen", async () => {
  const db = montarBase({ eventos: [ev1(null, "2026-11-01", "HB", "S")], dias: [{ day: "2026-11-01", visitorCount: 1, sessions: 1, visitors: ["HB"] }] });
  try {
    assert.deepEqual(await analytics.olvidarUsuario("A"), { days: 0 });
    assert.equal(db.dias.get("2026-11-01").visitorCount, 1);
    assert.equal(db.eventos.length, 1);
  } finally {
    db.restore();
  }
});

test("cerrar días vacía los sets y deja los contadores; no toca ayer ni hoy", async () => {
  const db = montarBase({
    eventos: [],
    dias: [
      { day: "2026-11-01", visitors: ["a", "b"], sessionHashes: ["s1", "s2", "s3"], loggedInVisitors: ["a"], visitorCount: 1, sessions: 1, loggedIn: 0 }, // contadores atrasados: manda el set
      { day: "2026-11-02", visitors: [], sessionHashes: [], loggedInVisitors: [], visitorCount: 9, sessions: 12, loggedIn: 2 }, // set ya vacío: se conserva el contador
      { day: "2026-11-09", visitors: ["x"], sessionHashes: ["y"], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 0 }, // anteayer de hoy=11-11: se cierra
      { day: "2026-11-10", visitors: ["x"], sessionHashes: ["y"], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 0 }, // ayer: abierto
      { day: "2026-11-11", visitors: ["x"], sessionHashes: ["y"], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 0 }, // hoy
    ],
  });
  try {
    await analytics.cerrarDiasAnteriores("2026-11-11");
    const d1 = db.dias.get("2026-11-01");
    assert.deepEqual([d1.visitors, d1.sessionHashes, d1.loggedInVisitors], [[], [], []]);
    assert.equal(d1.closed, true);
    assert.equal(d1.visitorCount, 2);
    assert.equal(d1.sessions, 3);
    assert.equal(d1.loggedIn, 1);
    const d2 = db.dias.get("2026-11-02");
    assert.equal(d2.visitorCount, 9);
    assert.equal(d2.sessions, 12);
    assert.equal(d2.loggedIn, 2);
    assert.equal(db.dias.get("2026-11-09").closed, true);
    assert.equal(db.dias.get("2026-11-10").closed, undefined, "ayer sigue abierto");
    assert.deepEqual(db.dias.get("2026-11-11").visitors, ["x"], "hoy sigue abierto");

    // Una segunda corrida el mismo día no hace nada (memo por día).
    db.dias.get("2026-11-10").visitors.push("z");
    await analytics.cerrarDiasAnteriores("2026-11-11");
    assert.deepEqual(db.dias.get("2026-11-10").visitors, ["x", "z"]);
  } finally {
    db.restore();
  }
});

test("TODO update con pipeline lleva { updatePipeline: true } (Mongoose 9 lo rechaza si falta)", async () => {
  const db = montarBase({
    eventos: [ev1("A", "2026-11-01", "HA", "S1")],
    dias: [
      { day: "2026-11-01", closed: true, visitors: [], sessionHashes: [], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 1 },
      { day: "2026-11-02", visitors: ["x"], sessionHashes: ["y"], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 0 },
    ],
  });
  try {
    await analytics.olvidarUsuario("A");
    await analytics.cerrarDiasAnteriores("2026-11-11");
    assert.ok(db.opciones.length >= 3, "olvido (abiertos y cerrados) y cierre llamaron a un update");
    for (const o of db.opciones) assert.equal(o?.updatePipeline, true);
    assert.equal(db.dias.get("2026-11-02").closed, true, "y el cierre efectivamente cerró (antes tiraba y se tragaba el error)");
  } finally {
    db.restore();
  }
});

test("el mock rechaza un pipeline SIN la opción (el test detecta la regresión)", async () => {
  const db = montarBase({ eventos: [], dias: [{ day: "2026-11-01", visitors: [] }] });
  try {
    await assert.rejects(() => AnalyticsDaily.updateOne({ day: "2026-11-01" }, [{ $set: { a: 1 } }]), /updatePipeline/);
    await assert.rejects(() => AnalyticsDaily.updateMany({ day: { $lt: "9" } }, [{ $set: { a: 1 } }], {}), /updatePipeline/);
  } finally {
    db.restore();
  }
});

test("cerrarDiasAnteriores: si falla deja un console.error con el motivo y reintenta en el próximo evento", async () => {
  const db = montarBase({
    eventos: [],
    dias: [{ day: "2026-11-01", visitors: ["a"], sessionHashes: ["s"], loggedInVisitors: [], visitorCount: 1, sessions: 1, loggedIn: 0 }],
  });
  const log = console.error;
  const logueado = [];
  console.error = (...a) => logueado.push(a.join(" "));
  try {
    db.fallas.updateMany = 1;
    await analytics.cerrarDiasAnteriores("2026-11-11");
    assert.equal(logueado.length, 1, "no se traga el error en silencio");
    assert.match(logueado[0], /cerrar los días anteriores/);
    assert.match(logueado[0], /updateMany caído/);
    assert.notEqual(db.dias.get("2026-11-01").closed, true, "no se cerró");

    await analytics.cerrarDiasAnteriores("2026-11-11");
    assert.equal(db.dias.get("2026-11-01").closed, true);
    assert.equal(logueado.length, 1, "sin más ruido cuando anda");
  } finally {
    console.error = log;
    db.restore();
  }
});

test("cerrarDiasAnteriores: un día ya cerrado no se toca", async () => {
  const db = montarBase({
    eventos: [],
    dias: [{ day: "2026-11-01", closed: true, visitors: ["fantasma"], sessionHashes: [], loggedInVisitors: [], visitorCount: 7, sessions: 9, loggedIn: 2 }],
  });
  try {
    await analytics.cerrarDiasAnteriores("2026-11-11");
    const d = db.dias.get("2026-11-01");
    assert.equal(d.visitorCount, 7);
    assert.deepEqual(d.visitors, ["fantasma"]);
  } finally {
    db.restore();
  }
});

const baseCerrada = () =>
  montarBase({
    eventos: [ev1("A", "2026-11-01", "HA", "SA1"), ev1(null, "2026-11-01", "HB", "SB1")],
    dias: [{ day: "2026-11-01", closed: true, visitors: [], sessionHashes: [], loggedInVisitors: [], visitorCount: 2, sessions: 2, loggedIn: 1 }],
  });

test("olvidarUsuario es reintentable: si falla el borrado no se descuenta, y el reintento descuenta UNA vez", async () => {
  const db = baseCerrada();
  try {
    db.fallas.deleteMany = 1;
    await assert.rejects(() => analytics.olvidarUsuario("A"), /deleteMany caído/);
    assert.equal(db.dias.get("2026-11-01").visitorCount, 2, "nada se descontó");
    assert.equal(db.eventos.length, 2, "los eventos siguen");

    await analytics.olvidarUsuario("A");
    const d = db.dias.get("2026-11-01");
    assert.equal(d.visitorCount, 1);
    assert.equal(d.sessions, 1);
    assert.equal(d.loggedIn, 0);

    assert.deepEqual(await analytics.olvidarUsuario("A"), { days: 0 });
    assert.equal(db.dias.get("2026-11-01").visitorCount, 1);
  } finally {
    db.restore();
  }
});

test("olvidarUsuario: sólo descuenta si el borrado borró algo", async () => {
  const db = baseCerrada();
  const original = AnalyticsEvent.deleteMany;
  try {
    AnalyticsEvent.deleteMany = async () => ({ deletedCount: 0 });
    await analytics.olvidarUsuario("A");
    assert.equal(db.dias.get("2026-11-01").visitorCount, 2);
  } finally {
    AnalyticsEvent.deleteMany = original;
    db.restore();
  }
});

test("olvidarUsuario saca el hash del set aunque el borrado de eventos falle (sin fuga)", async () => {
  const db = montarBase({
    eventos: [ev1("A", "2026-11-02", "HA", "SA2"), ev1(null, "2026-11-02", "HB", "SB2")],
    dias: [{ day: "2026-11-02", closed: false, visitors: ["HA", "HB"], sessionHashes: ["SA2", "SB2"], loggedInVisitors: ["HA"], visitorCount: 2, sessions: 2, loggedIn: 1 }],
  });
  try {
    db.fallas.deleteMany = 1;
    await assert.rejects(() => analytics.olvidarUsuario("A"));
    assert.deepEqual(db.dias.get("2026-11-02").visitors, ["HB"]);
    await analytics.olvidarUsuario("A");
    assert.equal(db.dias.get("2026-11-02").visitorCount, 1);
  } finally {
    db.restore();
  }
});

test("el pipeline de olvido tolera sets y contadores ausentes", () => {
  const plan = { hashes: new Set(["H"]), sessions: new Set(["S"]) };
  const doc = aplicarPipeline({ day: "d" }, analytics.pipelineDeOlvido(plan));
  assert.equal(doc.visitorCount, 0);
  assert.equal(doc.sessions, 0);
  const cerrado = aplicarPipeline({ day: "d", closed: true }, analytics.pipelineDeOlvido(plan));
  assert.equal(cerrado.visitorCount, 0);
});

test("tope de visitantes NUEVOS por IP y día: rotar el User-Agent desde una IP se corta, y un conocido sigue", async () => {
  process.env.ANALYTICS_MAX_NUEVOS_POR_IP_DIA = "3";
  const s = stubTrack();
  const evento = [{ type: "pageview", path: "/" }];
  const conUa = (ua, ip) => ({ ...pedido(undefined, ip), headers: { "user-agent": ua, host: "rincones.test" } });
  try {
    const resultados = [];
    for (let i = 0; i < 6; i += 1) resultados.push((await analytics.track(conUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Rotado" + i, "7.7.7.7"), evento)).accepted);
    assert.deepEqual(resultados, [1, 1, 1, 0, 0, 0]);
    assert.equal(s.insertMany, 3, "lo descartado no toca la base");
    assert.equal((await analytics.track(conUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Rotado0", "7.7.7.7"), evento)).accepted, 1);
    assert.equal((await analytics.track(conUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Rotado9", "8.8.8.8"), evento)).accepted, 1);
  } finally {
    delete process.env.ANALYTICS_MAX_NUEVOS_POR_IP_DIA;
    s.restore();
  }
});

test("con el tope de anónimos lleno, los eventos CON sesión siguen entrando (reserva aparte)", async () => {
  process.env.ANALYTICS_MAX_VISITANTES_DIA = "2";
  const lleno = { visitorCount: 2, sessions: 2, loggedIn: 0 };
  const evento = [{ type: "pageview", path: "/" }];
  const s = stubTrack({ existente: lleno, conocido: false });
  try {
    assert.equal((await analytics.track(pedido(undefined, "9.9.9.1"), evento)).accepted, 0);
    const r = await analytics.track(pedido({ id: "7", role: "user", email: "ana@gmail.com" }, "9.9.9.2"), evento);
    assert.equal(r.accepted, 1);
    assert.equal(s.updates.length, 1);
    assert.ok(s.updates[0].$addToSet.visitors);
    assert.ok(s.updates[0].$addToSet.loggedInVisitors);
  } finally {
    delete process.env.ANALYTICS_MAX_VISITANTES_DIA;
    s.restore();
  }
});

test("la reserva de sesión también tiene techo", () => {
  process.env.ANALYTICS_MAX_VISITANTES_DIA = "2";
  process.env.ANALYTICS_RESERVA_LOGUEADOS_DIA = "3";
  try {
    assert.equal(analytics.superaTope({ visitorCount: 2 }, true), false);
    assert.equal(analytics.superaTope({ visitorCount: 5 }, true), true);
    assert.equal(analytics.superaTope({ visitorCount: 2 }, false), true);
    assert.equal(analytics.armarAddToSet({ visitorHash: "v", sessionHash: "s", userId: "u", existente: { visitorCount: 5, sessions: 0, loggedIn: 5 } }).visitors, undefined);
  } finally {
    delete process.env.ANALYTICS_MAX_VISITANTES_DIA;
    delete process.env.ANALYTICS_RESERVA_LOGUEADOS_DIA;
  }
});

// ── Cuentas excluidas ───────────────────────────────────────────────────────

test("admins y cuentas de prueba no se miden; los usuarios comunes sí", () => {
  const { esCuentaExcluida } = analytics;
  assert.equal(esCuentaExcluida({ role: "admin", email: "yo@gmail.com" }, {}), true);
  assert.equal(esCuentaExcluida({ role: "user", email: "e2e_a_b@example.test" }, {}), true);
  assert.equal(esCuentaExcluida({ role: "user", email: "E2E@EXAMPLE.TEST" }, {}), true, "sin distinguir mayúsculas");
  assert.equal(esCuentaExcluida({ role: "user", email: "ana@gmail.com" }, {}), false);
  assert.equal(esCuentaExcluida({ role: "user", email: "x@notexample.test" }, {}), false, "es un sufijo de dominio, no una subcadena");
  assert.equal(esCuentaExcluida(undefined, {}), false, "anónimo: se mide");
});

test("la exclusión se configura por entorno", () => {
  const { esCuentaExcluida, dominiosExcluidos, condicionesDeExclusion } = analytics;
  assert.equal(esCuentaExcluida({ role: "admin", email: "a@b.com" }, { ANALYTICS_EXCLUIR_ADMINS: "0" }), false);
  assert.equal(esCuentaExcluida({ role: "admin", email: "a@b.com" }, { ANALYTICS_EXCLUIR_ADMINS: "false" }), false);
  assert.equal(esCuentaExcluida({ role: "user", email: "qa@interno.com" }, { ANALYTICS_EXCLUIR_DOMINIOS: "interno.com, @otro.test" }), true);
  assert.deepEqual(dominiosExcluidos({ ANALYTICS_EXCLUIR_DOMINIOS: "interno.com, @otro.test" }), ["interno.com", "otro.test"]);
  assert.deepEqual(dominiosExcluidos({ ANALYTICS_EXCLUIR_DOMINIOS: "" }), []);
  // Las mismas reglas, como condiciones de Mongo.
  const c = condicionesDeExclusion({});
  assert.deepEqual(c[0], { role: "admin" });
  assert.ok(c[1].email.test("e2e@example.test"));
  assert.ok(!c[1].email.test("ana@gmail.com"));
  assert.deepEqual(condicionesDeExclusion({ ANALYTICS_EXCLUIR_ADMINS: "0", ANALYTICS_EXCLUIR_DOMINIOS: "" }), []);
});

// ── track: exclusión y topes ────────────────────────────────────────────────

const pedido = (user, ip = "10.0.0.1") => ({
  headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", host: "rincones.test" },
  ip,
  user,
});

const stubTrack = ({ existente = null, conocido = false } = {}) => {
  const llamadas = { insertMany: 0, updates: [] };
  const orig = {
    insertMany: AnalyticsEvent.insertMany,
    findOne: AnalyticsDaily.findOne,
    exists: AnalyticsDaily.exists,
    findOneAndUpdate: AnalyticsDaily.findOneAndUpdate,
    updateOne: AnalyticsDaily.updateOne,
    updateMany: AnalyticsDaily.updateMany,
  };
  AnalyticsEvent.insertMany = async () => { llamadas.insertMany += 1; };
  AnalyticsDaily.findOne = () => ({ select: () => ({ lean: async () => existente }) });
  AnalyticsDaily.exists = async () => (conocido ? { _id: 1 } : null);
  AnalyticsDaily.findOneAndUpdate = (f, update) => {
    llamadas.updates.push(update);
    return { select: async () => ({ visitors: [], sessionHashes: [], loggedInVisitors: [] }) };
  };
  AnalyticsDaily.updateOne = async () => {};
  AnalyticsDaily.updateMany = async () => {};
  llamadas.restore = () => Object.entries(orig).forEach(([k, f]) => {
    if (k === "insertMany") AnalyticsEvent.insertMany = f;
    else AnalyticsDaily[k] = f;
  });
  return llamadas;
};

test("track no cuenta a un admin ni a una cuenta de prueba con sesión abierta", async () => {
  const s = stubTrack();
  try {
    const evento = [{ type: "pageview", path: "/bodega" }];
    assert.deepEqual(await analytics.track(pedido({ id: "1", role: "admin", email: "yo@gmail.com" }), evento), { accepted: 0 });
    assert.deepEqual(await analytics.track(pedido({ id: "2", role: "user", email: "e2e_x@example.test" }), evento), { accepted: 0 });
    assert.equal(s.insertMany, 0);
    assert.equal(s.updates.length, 0);

    assert.deepEqual(await analytics.track(pedido({ id: "3", role: "user", email: "ana@gmail.com" }), evento), { accepted: 1 });
    assert.deepEqual(await analytics.track(pedido(undefined), evento), { accepted: 1 });
    assert.equal(s.insertMany, 2);
  } finally {
    s.restore();
  }
});

test("track vuelve a medir admins si se configura", async () => {
  const s = stubTrack();
  process.env.ANALYTICS_EXCLUIR_ADMINS = "0";
  try {
    const r = await analytics.track(pedido({ id: "1", role: "admin", email: "yo@gmail.com" }), [{ type: "pageview", path: "/" }]);
    assert.equal(r.accepted, 1);
  } finally {
    delete process.env.ANALYTICS_EXCLUIR_ADMINS;
    s.restore();
  }
});

test("con el día lleno, un visitante nuevo se descarta y uno conocido sigue contando", async () => {
  process.env.ANALYTICS_MAX_VISITANTES_DIA = "2";
  const lleno = { visitorCount: 2, sessions: 2, loggedIn: 0 };
  const evento = [{ type: "pageview", path: "/" }];
  try {
    const nuevo = stubTrack({ existente: lleno, conocido: false });
    try {
      assert.deepEqual(await analytics.track(pedido(undefined, "9.9.9.9"), evento), { accepted: 0 });
      assert.equal(nuevo.insertMany, 0, "ni evento crudo");
      assert.equal(nuevo.updates.length, 0, "ni resumen");
    } finally {
      nuevo.restore();
    }
    const conocido = stubTrack({ existente: lleno, conocido: true });
    try {
      assert.deepEqual(await analytics.track(pedido(undefined, "9.9.9.9"), evento), { accepted: 1 });
      assert.equal(conocido.updates.length, 1);
      assert.equal(conocido.updates[0].$addToSet?.visitors, undefined, "el set lleno no crece");
    } finally {
      conocido.restore();
    }
  } finally {
    delete process.env.ANALYTICS_MAX_VISITANTES_DIA;
  }
});

test("armarAddToSet respeta cada tope por separado", () => {
  const { armarAddToSet, superaTope, LIMITE_VISITANTES_DIA, LIMITE_SESIONES_DIA } = analytics;
  assert.deepEqual(armarAddToSet({ visitorHash: "v", sessionHash: "s", userId: "u", existente: null }), {
    visitors: "v",
    sessionHashes: "s",
    loggedInVisitors: "v",
  });
  assert.deepEqual(armarAddToSet({ visitorHash: "v", sessionHash: "s", userId: null, existente: { visitorCount: 1, sessions: LIMITE_SESIONES_DIA } }), {
    visitors: "v",
  });
  assert.equal(superaTope({ visitorCount: LIMITE_VISITANTES_DIA }), true);
  assert.equal(superaTope({ visitorCount: LIMITE_VISITANTES_DIA - 1, sessions: 1 }), false);
  assert.equal(superaTope(null), false);
});

// ── byType: los tipos conocidos no se desplazan ────────────────────────────

test("sembrar tipos inventados no desplaza a los eventos legítimos a 'otro'", () => {
  const { armarIncrementos, TIPOS_CONOCIDOS, MAX_CLAVES_TYPE } = analytics;
  // El día ya está lleno de basura: MAX_CLAVES_TYPE tipos inventados.
  const byType = {};
  for (let i = 0; i < MAX_CLAVES_TYPE; i += 1) byType[`basura_${i}`] = 1;

  const documentos = [...TIPOS_CONOCIDOS].map((type) => ({ type, path: "/", referrer: "" }));
  documentos.push({ type: "basura_nueva", path: "/", referrer: "" });
  const inc = armarIncrementos({ documentos, device: "mobile", existentes: { byType }, hora: 10 });

  for (const tipo of TIPOS_CONOCIDOS) {
    assert.equal(inc[`byType.${tipo}`], 1, `${tipo} conserva su clave`);
  }
  assert.equal(inc["byType.otro"], 1, "lo desconocido nuevo sí va a otro");
  assert.equal(inc["byType.basura_nueva"], undefined);
});

test("los tipos que manda el client están todos en la lista de conocidos", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..", "client", "src");
  if (!fs.existsSync(raiz)) return; // el server se puede probar solo
  const encontrados = new Set();
  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) recorrer(p);
      else if (/\.(jsx?|mjs)$/.test(f.name) && !/\.test\./.test(f.name)) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/trackEvent\(\s*"([a-z0-9_]+)"/g)) encontrados.add(m[1]);
      }
    }
  };
  recorrer(raiz);
  assert.ok(encontrados.size > 5, "encontró los trackEvent del client");
  for (const tipo of encontrados) {
    assert.ok(analytics.TIPOS_CONOCIDOS.has(tipo), `${tipo} falta en TIPOS_CONOCIDOS`);
  }
});
