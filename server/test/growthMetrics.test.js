const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const ChangeLog = require("../src/models/changeLog.model");
const AnalyticsEvent = require("../src/models/analyticsEvent.model");
const AnalyticsDaily = require("../src/models/analyticsDaily.model");
const growth = require("../src/services/growthMetrics.service");
const analytics = require("../src/services/analytics.service");

/**
 * Métricas de crecimiento: las reglas que, si fallan, hacen que un porcentaje diga otra cosa sin
 * avisar (a quién se le puede exigir activación, qué es "sin datos", cómo se parte Google de contraseña).
 */

const AHORA = new Date("2026-11-20T15:00:00Z"); // 12:00 en Argentina
const hace = (horas) => new Date(AHORA.getTime() - horas * 3600 * 1000);
const rango = ["2026-11-18", "2026-11-19", "2026-11-20"];

const u = (id, horasAtras, extra = {}) => ({
  _id: id,
  createdAt: hace(horasAtras),
  emailVerified: false,
  onboardedAt: null,
  tieneGoogle: false,
  ...extra,
});

test("porcentaje: un decimal, y null (no 0) cuando no hay base", () => {
  assert.equal(growth.porcentaje(1, 3), 33.3);
  assert.equal(growth.porcentaje(2, 3), 66.7);
  assert.equal(growth.porcentaje(0, 5), 0);
  assert.equal(growth.porcentaje(0, 0), null);
});

test("altas por día y por método, con los días sin altas en cero", () => {
  const usuarios = [
    u("a", 1, { tieneGoogle: true }), // 20/11 09:00 AR
    u("b", 2), // 20/11 10:00
    u("c", 30), // 19/11
  ];
  const r = growth.analizarCohorte({ usuarios, rango, ahora: AHORA });
  assert.equal(r.signups.total, 3);
  assert.deepEqual(r.signups.byMethod, { google: 1, password: 2 });
  assert.deepEqual(r.signups.daily, [
    { day: "2026-11-18", total: 0, google: 0, password: 0 },
    { day: "2026-11-19", total: 1, google: 0, password: 1 },
    { day: "2026-11-20", total: 2, google: 1, password: 1 },
  ]);
});

test("el día de un alta es el de Argentina, no el de UTC", () => {
  // 23:30 en Argentina del 19 = 02:30 UTC del 20.
  const r = growth.analizarCohorte({
    usuarios: [{ _id: "x", createdAt: new Date("2026-11-20T02:30:00Z") }],
    rango,
    ahora: AHORA,
  });
  assert.equal(r.signups.daily.find((d) => d.day === "2026-11-19").total, 1);
  assert.equal(r.signups.daily.find((d) => d.day === "2026-11-20").total, 0);
});

test("verificaron el mail y terminaron el onboarding, en porcentaje de la cohorte", () => {
  const usuarios = [
    u("a", 5, { emailVerified: true, onboardedAt: new Date() }),
    u("b", 5, { emailVerified: true }),
    u("c", 5),
    u("d", 5),
  ];
  const r = growth.analizarCohorte({ usuarios, rango, ahora: AHORA });
  assert.equal(r.verifiedPct, 50);
  assert.equal(r.onboardedPct, 25);
  assert.equal(r.verified, 2);
  assert.equal(r.onboarded, 1);
});

test("cohorte vacía: porcentajes null, no 0", () => {
  const r = growth.analizarCohorte({ usuarios: [], rango, ahora: AHORA });
  assert.equal(r.verifiedPct, null);
  assert.equal(r.onboardedPct, null);
  assert.equal(r.activation.within24h.pct, null);
  assert.equal(r.signups.total, 0);
});

test("activación: sólo cuentan quienes ya cumplieron el plazo, y el vino tiene que llegar a tiempo", () => {
  const usuarios = [
    u("rapido", 24 * 3), // 3 días: cargó a las 2 h
    u("lento", 24 * 3), // 3 días: cargó a las 50 h (fuera de 24 h)
    u("nunca", 24 * 3), // 3 días: nunca cargó
    u("reciente", 5), // 5 h: todavía no pudo "no activarse"
    u("vieja", 24 * 10), // 10 días: cargó a los 5 días
  ];
  const primerVino = new Map([
    ["rapido", new Date(usuarios[0].createdAt.getTime() + 2 * 3600 * 1000)],
    ["lento", new Date(usuarios[1].createdAt.getTime() + 50 * 3600 * 1000)],
    ["reciente", new Date(usuarios[3].createdAt.getTime() + 1 * 3600 * 1000)],
    ["vieja", new Date(usuarios[4].createdAt.getTime() + 5 * 24 * 3600 * 1000)],
  ]);
  const r = growth.analizarCohorte({ usuarios, primerVino, rango, ahora: AHORA });
  // 24 h: elegibles = los 4 con >= 24 h (no el reciente); activos = sólo "rapido".
  assert.deepEqual(r.activation.within24h, { eligible: 4, activated: 1, pct: 25 });
  // 7 días: elegibles = sólo "vieja"; activa a los 5 días.
  assert.deepEqual(r.activation.within7d, { eligible: 1, activated: 1, pct: 100 });
});

test("serie de vinos: días en cero incluidos, y las botellas salen del resumen diario", () => {
  const s = growth.armarSerieDeVinos({
    rango,
    agregados: [{ _id: "2026-11-19", n: 4 }, { _id: "2026-11-20", n: 1 }, { _id: "2026-01-01", n: 99 }],
    filasDiarias: [{ day: "2026-11-20", byType: { bottle_opened: 7, pageview: 50 } }, { day: "2026-11-18", byType: {} }],
  });
  assert.deepEqual(s.daily, [
    { day: "2026-11-18", added: 0, bottleOpenedEvents: 0 },
    { day: "2026-11-19", added: 4, bottleOpenedEvents: 0 },
    { day: "2026-11-20", added: 1, bottleOpenedEvents: 7 },
  ]);
  assert.equal(s.totalAdded, 5, "un día fuera del rango no suma");
  assert.equal(s.totalBottleOpenedEvents, 7);
});

test("bajas de cuenta: propias y de admin por separado", () => {
  const b = growth.armarBajas({
    rango,
    filas: [
      { _id: { day: "2026-11-19", self: true }, n: 2 },
      { _id: { day: "2026-11-19", self: false }, n: 5 },
      { _id: { day: "2026-11-20", self: true }, n: 1 },
    ],
  });
  assert.equal(b.total, 8);
  assert.equal(b.bySelf, 3);
  assert.equal(b.byAdmin, 5);
  assert.deepEqual(b.daily[1], { day: "2026-11-19", self: 2, admin: 5 });
  assert.deepEqual(b.daily[0], { day: "2026-11-18", self: 0, admin: 0 });
});

test("activos: DAU, WAU, MAU y pegajosidad (null sin MAU)", () => {
  assert.deepEqual(growth.armarActivos({ dau: 2, wau: 5, mau: 8, hoy: "2026-11-20" }), {
    asOf: "2026-11-20",
    dau: 2,
    wau: 5,
    mau: 8,
    stickinessPct: 25,
  });
  assert.equal(growth.armarActivos({ hoy: "2026-11-20" }).stickinessPct, null);
});

// ── La consulta completa, con los modelos simulados ────────────────────────

test("consultarCrecimiento arma la forma completa y excluye cuentas de prueba y admins", async () => {
  const orig = {
    uFind: User.find,
    uCount: User.countDocuments,
    wAgg: Wine.aggregate,
    clAgg: ChangeLog.aggregate,
    evAgg: AnalyticsEvent.aggregate,
    dFind: AnalyticsDaily.find,
  };
  const pipelines = { eventos: null, vinos: [], cambios: null };
  const consultasUser = [];
  // Reloj fijo: los "hace 3 días" de abajo no dependen de cuándo corre el test.
  test.mock.timers.enable({ apis: ["Date"], now: AHORA });
  const chain = (rows) => {
    const c = { select: () => c, limit: () => c, lean: async () => rows };
    return c;
  };
  User.find = (filtro) => {
    consultasUser.push(filtro);
    // Primera: ids excluidos; segunda: cohorte.
    if (filtro.$or) return chain([{ _id: "adm" }, { _id: "qa" }]);
    return chain([
      { _id: "n1", createdAt: new Date(Date.now() - 3 * 86400000), emailVerified: true, onboardedAt: new Date(), googleId: "g" },
      { _id: "n2", createdAt: new Date(Date.now() - 3 * 86400000) },
    ]);
  };
  User.countDocuments = async (f) => (f && f.$or ? 3 : 10);
  Wine.aggregate = async (p) => {
    pipelines.vinos.push(p);
    return p[1]?.$group?._id === "$userId" ? [{ _id: "n1", primero: new Date(Date.now() - 3 * 86400000 + 3600 * 1000) }] : [];
  };
  ChangeLog.aggregate = async (p) => {
    pipelines.cambios = p;
    return [];
  };
  AnalyticsEvent.aggregate = async (p) => {
    pipelines.eventos = p;
    return [{ dau: [{ n: 1 }], wau: [{ n: 2 }], mau: [{ n: 3 }] }];
  };
  AnalyticsDaily.find = () => chain([]);
  try {
    const r = await growth.consultarCrecimiento({ days: 7 });
    assert.equal(r.range.days, 7);
    assert.deepEqual(r.accounts, { total: 10, excluded: 3, real: 7 });
    assert.equal(r.signups.total, 2);
    assert.deepEqual(r.signups.byMethod, { google: 1, password: 1 });
    assert.equal(r.verifiedPct, 50);
    assert.deepEqual(r.activation.within24h, { eligible: 2, activated: 1, pct: 50 });
    assert.deepEqual(r.activeUsers, { asOf: r.activeUsers.asOf, dau: 1, wau: 2, mau: 3, stickinessPct: 33.3 });
    assert.equal(r.wines.daily.length, 7);
    assert.equal(r.accountDeletions.total, 0);

    // La cohorte se pidió SIN admins ni cuentas de prueba.
    const cohorte = consultasUser.find((f) => f.$nor);
    assert.equal(cohorte.$nor.length, analytics.condicionesDeExclusion().length);
    // Los activos y los vinos dejan afuera a los ids excluidos.
    assert.deepEqual(pipelines.eventos[0].$match.userId.$nin, ["adm", "qa"]);
    assert.deepEqual(pipelines.vinos[0][0].$match.userId.$nin, ["adm", "qa"]);
    // La agregación de bajas deja afuera los mails de prueba.
    assert.ok(pipelines.cambios[0].$match["before.email"].$not instanceof RegExp);
    // La zona horaria de los días es la de Argentina.
    assert.equal(pipelines.vinos[0][1].$group._id.$dateToString.timezone, "-03:00");
  } finally {
    test.mock.timers.reset();
    User.find = orig.uFind;
    User.countDocuments = orig.uCount;
    Wine.aggregate = orig.wAgg;
    ChangeLog.aggregate = orig.clAgg;
    AnalyticsEvent.aggregate = orig.evAgg;
    AnalyticsDaily.find = orig.dFind;
  }
});

// ── Los visitantes del período nunca son menos que el mejor día ────────────

test("getSummary: visitors del período >= cualquier día de la serie", async () => {
  const hoy = analytics.hoy();
  const origFind = AnalyticsDaily.find;
  const origAgg = AnalyticsEvent.aggregate;
  AnalyticsDaily.find = () => ({
    sort: () => ({
      lean: async () => [{ day: hoy, views: 10, visitorCount: 9, sessions: 9 }],
    }),
  });
  try {
    // Los eventos crudos ya no tienen a quien se dio de baja: el período contaría 7 y el día 9.
    AnalyticsEvent.aggregate = async () => [{ total: 7 }];
    const r = await analytics.getSummary({ days: 7 });
    const mejor = Math.max(...r.daily.map((d) => d.visitors));
    assert.equal(mejor, 9);
    assert.ok(r.totals.visitors >= mejor);
    assert.equal(r.totals.visitors, 9);

    // Y cuando el período cuenta más, manda el período.
    AnalyticsEvent.aggregate = async () => [{ total: 12 }];
    assert.equal((await analytics.getSummary({ days: 7 })).totals.visitors, 12);
  } finally {
    AnalyticsDaily.find = origFind;
    AnalyticsEvent.aggregate = origAgg;
  }
});
