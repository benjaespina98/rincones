const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const ChangeLog = require("../src/models/changeLog.model");
const AnalyticsEvent = require("../src/models/analyticsEvent.model");
const AnalyticsDaily = require("../src/models/analyticsDaily.model");
const growth = require("../src/services/growthMetrics.service");

/**
 * Bordes de las métricas de crecimiento: los límites exactos de 24 h y 7 días, fechas como string ISO,
 * ids reales de Mongo y el reloj fijo (`mock.timers`) en vez de depender de `Date.now`.
 */

const AHORA = new Date("2026-11-20T15:00:00Z");
const HORA = 3600 * 1000;
const rango = ["2026-11-18", "2026-11-19", "2026-11-20"];
const usuario = (id, creado, extra = {}) => ({ _id: id, createdAt: creado, emailVerified: false, onboardedAt: null, tieneGoogle: false, ...extra });

test("activación en el límite EXACTO de 24 h: la cuenta de exactamente 24 h ya es elegible, y un vino a las 24 h exactas llega a tiempo", () => {
  const creado = new Date(AHORA.getTime() - 24 * HORA);
  const primerVino = new Map([["u", new Date(creado.getTime() + 24 * HORA)]]);
  const r = growth.analizarCohorte({ usuarios: [usuario("u", creado)], primerVino, rango, ahora: AHORA });
  assert.deepEqual(r.activation.within24h, { eligible: 1, activated: 1, pct: 100 });
  assert.equal(r.activation.within7d.eligible, 0);

  // Un milisegundo más tarde ya no llegó a tiempo; un milisegundo menos de antigüedad no es elegible.
  const tarde = new Map([["u", new Date(creado.getTime() + 24 * HORA + 1)]]);
  assert.equal(growth.analizarCohorte({ usuarios: [usuario("u", creado)], primerVino: tarde, rango, ahora: AHORA }).activation.within24h.activated, 0);
  const casi = new Date(AHORA.getTime() - 24 * HORA + 1);
  assert.equal(growth.analizarCohorte({ usuarios: [usuario("u", casi)], rango, ahora: AHORA }).activation.within24h.eligible, 0);
});

test("activación en el límite EXACTO de 7 días", () => {
  const creado = new Date(AHORA.getTime() - 7 * 24 * HORA);
  const primerVino = new Map([["u", new Date(creado.getTime() + 7 * 24 * HORA)]]);
  const r = growth.analizarCohorte({ usuarios: [usuario("u", creado)], primerVino, rango, ahora: AHORA });
  assert.deepEqual(r.activation.within7d, { eligible: 1, activated: 1, pct: 100 });
  const tarde = new Map([["u", new Date(creado.getTime() + 7 * 24 * HORA + 1)]]);
  assert.equal(growth.analizarCohorte({ usuarios: [usuario("u", creado)], primerVino: tarde, rango, ahora: AHORA }).activation.within7d.activated, 0);
});

test("createdAt como string ISO y _id ObjectId reales funcionan igual que con Date y strings", () => {
  const id = new mongoose.Types.ObjectId();
  const iso = new Date(AHORA.getTime() - 3 * 24 * HORA).toISOString();
  const primerVino = new Map([[String(id), new Date(new Date(iso).getTime() + 2 * HORA)]]);
  const r = growth.analizarCohorte({ usuarios: [usuario(id, iso)], primerVino, rango, ahora: AHORA });
  assert.deepEqual(r.activation.within24h, { eligible: 1, activated: 1, pct: 100 });
  assert.equal(r.signups.daily.find((d) => d.day === "2026-11-17"), undefined, "fuera de la serie no suma");
});

test("un vino anterior al alta (reloj raro) cuenta como activación, no rompe", () => {
  const creado = new Date(AHORA.getTime() - 3 * 24 * HORA);
  const primerVino = new Map([["u", new Date(creado.getTime() - HORA)]]);
  const r = growth.analizarCohorte({ usuarios: [usuario("u", creado)], primerVino, rango, ahora: AHORA });
  assert.equal(r.activation.within24h.activated, 1);
});

test("consultarCrecimiento SIN condiciones de exclusión y SIN activos: sin $nor ni $nin, y todo en cero", async () => {
  const env = { a: process.env.ANALYTICS_EXCLUIR_ADMINS, d: process.env.ANALYTICS_EXCLUIR_DOMINIOS };
  process.env.ANALYTICS_EXCLUIR_ADMINS = "0";
  process.env.ANALYTICS_EXCLUIR_DOMINIOS = "";
  const orig = { uFind: User.find, uCount: User.countDocuments, wAgg: Wine.aggregate, clAgg: ChangeLog.aggregate, evAgg: AnalyticsEvent.aggregate, dFind: AnalyticsDaily.find };
  const consultas = [];
  const pipelines = { eventos: null, vinos: [], cambios: null };
  const chain = (rows) => {
    const c = { select: () => c, limit: () => c, lean: async () => rows };
    return c;
  };
  test.mock.timers.enable({ apis: ["Date"], now: AHORA });
  User.find = (f) => {
    consultas.push(f);
    return chain([]);
  };
  User.countDocuments = async (f) => (f && f.$or ? 99 : 4);
  Wine.aggregate = async (p) => {
    pipelines.vinos.push(p);
    return [];
  };
  ChangeLog.aggregate = async (p) => {
    pipelines.cambios = p;
    return [];
  };
  AnalyticsEvent.aggregate = async (p) => {
    pipelines.eventos = p;
    return []; // sin activos: el $facet devolvió vacío
  };
  AnalyticsDaily.find = () => chain([]);
  try {
    const r = await growth.consultarCrecimiento({ days: 3 });
    assert.deepEqual(r.range, { days: 3, from: "2026-11-18", to: "2026-11-20" }, "el rango sale del reloj fijado");
    assert.deepEqual(r.accounts, { total: 4, excluded: 0, real: 4 });
    assert.equal(consultas.length, 1, "no se buscan ids excluidos si no hay condiciones");
    assert.equal(consultas[0].$nor, undefined);
    assert.equal(pipelines.eventos[0].$match.userId.$nin, undefined);
    assert.equal(pipelines.vinos[0][0].$match.userId, undefined);
    assert.equal(pipelines.cambios[0].$match["before.email"], undefined);
    assert.deepEqual(r.activeUsers, { asOf: "2026-11-20", dau: 0, wau: 0, mau: 0, stickinessPct: null });
    assert.equal(r.signups.total, 0);
    assert.equal(r.verifiedPct, null);
  } finally {
    test.mock.timers.reset();
    User.find = orig.uFind;
    User.countDocuments = orig.uCount;
    Wine.aggregate = orig.wAgg;
    ChangeLog.aggregate = orig.clAgg;
    AnalyticsEvent.aggregate = orig.evAgg;
    AnalyticsDaily.find = orig.dFind;
    for (const [k, v] of [["ANALYTICS_EXCLUIR_ADMINS", env.a], ["ANALYTICS_EXCLUIR_DOMINIOS", env.d]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("armarBajas ignora filas sin día de la serie y cuenta n no numérico como 0", () => {
  const b = growth.armarBajas({ rango, filas: [{ _id: { day: "2026-01-01", self: true }, n: 3 }, { _id: { day: "2026-11-19", self: false }, n: "x" }, {}] });
  assert.equal(b.bySelf, 3, "se suma al total aunque el día quede fuera de la serie");
  assert.equal(b.daily.reduce((n, d) => n + d.self + d.admin, 0), 0);
});
