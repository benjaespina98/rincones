/**
 * Métricas de crecimiento y activación para el resumen del admin (`GET /admin/summary`, clave `growth`).
 *
 * Todo sale de colecciones que ya existen (User, Wine, ChangeLog, AnalyticsEvent, AnalyticsDaily) y
 * de consultas baratas: una lectura liviana de la cohorte, un `group` sobre vinos, una agregación
 * con `$facet` para los activos y una sobre ChangeLog. Las cuentas de prueba y los admins quedan
 * afuera con las mismas reglas que el tracking (`analytics.service.esCuentaExcluida`).
 *
 * Las partes con reglas propias son funciones puras y se prueban sin base (ver
 * test/growthMetrics.test.js).
 */

const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const ChangeLog = require("../models/changeLog.model");
const AnalyticsEvent = require("../models/analyticsEvent.model");
const AnalyticsDaily = require("../models/analyticsDaily.model");
const analytics = require("./analytics.service");
const { construirRango, diaDe, limitesDelDia, sumarDias } = require("../utils/dateRange");

const MAX_DIAS = 365;
const HORA_MS = 60 * 60 * 1000;
/** Tope de ids excluidos que se mandan a Mongo en un `$nin`. */
const MAX_EXCLUIDOS = 5000;
/** Tope de usuarios de la cohorte que se leen (una app personal queda lejos). */
const MAX_COHORTE = 50000;

/** n/d como porcentaje con un decimal, o `null` si no hay base (no 0: "sin datos" no es "0%"). */
const porcentaje = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * Lo que sale de mirar a la cohorte de usuarios que se registraron en el rango.
 *
 * `usuarios`: [{ _id, createdAt, emailVerified, onboardedAt, tieneGoogle }].
 * `primerVino`: Map(String(userId) -> Date del primer vino cargado).
 *
 * Activación = cargó al menos un vino a las 24 h / a los 7 días de registrarse. Sólo cuentan en el
 * denominador los usuarios a los que ya les pasó ese plazo (`ahora - createdAt >= plazo`): un
 * usuario de hace una hora no pudo "no activarse" todavía, y meterlo bajaría el porcentaje sin
 * que haya pasado nada.
 */
const analizarCohorte = ({ usuarios, primerVino = new Map(), rango, ahora = new Date() }) => {
  const dias = new Map(rango.map((day) => [day, { day, total: 0, google: 0, password: 0 }]));
  let google = 0;
  let verificados = 0;
  let onboarded = 0;
  const act = { e24: 0, a24: 0, e7: 0, a7: 0 };

  for (const u of usuarios) {
    const metodo = u.tieneGoogle ? "google" : "password";
    const fila = dias.get(diaDe(new Date(u.createdAt)));
    if (fila) {
      fila.total += 1;
      fila[metodo] += 1;
    }
    if (u.tieneGoogle) google += 1;
    if (u.emailVerified) verificados += 1;
    if (u.onboardedAt) onboarded += 1;

    const creado = new Date(u.createdAt).getTime();
    const primero = primerVino.get(String(u._id));
    const tardo = primero ? new Date(primero).getTime() - creado : null;
    if (ahora.getTime() - creado >= 24 * HORA_MS) {
      act.e24 += 1;
      if (tardo !== null && tardo <= 24 * HORA_MS) act.a24 += 1;
    }
    if (ahora.getTime() - creado >= 7 * 24 * HORA_MS) {
      act.e7 += 1;
      if (tardo !== null && tardo <= 7 * 24 * HORA_MS) act.a7 += 1;
    }
  }

  const total = usuarios.length;
  return {
    signups: {
      total,
      byMethod: { google, password: total - google },
      daily: [...dias.values()],
    },
    verifiedPct: porcentaje(verificados, total),
    onboardedPct: porcentaje(onboarded, total),
    verified: verificados,
    onboarded,
    activation: {
      within24h: { eligible: act.e24, activated: act.a24, pct: porcentaje(act.a24, act.e24) },
      within7d: { eligible: act.e7, activated: act.a7, pct: porcentaje(act.a7, act.e7) },
    },
  };
};

/**
 * Serie diaria de vinos cargados y acciones "tomar botella", con los días en cero incluidos.
 * `agregados`: [{ _id: "YYYY-MM-DD", n }] (Wine.createdAt). `byTypeDiario`: filas de AnalyticsDaily.
 */
const armarSerieDeVinos = ({ rango, agregados = [], filasDiarias = [] }) => {
  const added = new Map(agregados.map((r) => [r._id, Number(r.n) || 0]));
  const abiertas = new Map(filasDiarias.map((f) => [f.day, Number(f.byType?.bottle_opened) || 0]));
  const daily = rango.map((day) => ({
    day,
    added: added.get(day) || 0,
    bottleOpenedEvents: abiertas.get(day) || 0,
  }));
  return {
    totalAdded: daily.reduce((n, d) => n + d.added, 0),
    totalBottleOpenedEvents: daily.reduce((n, d) => n + d.bottleOpenedEvents, 0),
    daily,
  };
};

/** Bajas de cuenta por día, separando las propias de las que hizo un admin. Filas: [{ _id: {day, self}, n }]. */
const armarBajas = ({ rango, filas = [] }) => {
  const dias = new Map(rango.map((day) => [day, { day, self: 0, admin: 0 }]));
  let self = 0;
  let admin = 0;
  for (const f of filas) {
    const n = Number(f.n) || 0;
    const fila = dias.get(f._id?.day);
    if (f._id?.self) {
      self += n;
      if (fila) fila.self += n;
    } else {
      admin += n;
      if (fila) fila.admin += n;
    }
  }
  return { total: self + admin, bySelf: self, byAdmin: admin, daily: [...dias.values()] };
};

/** El resultado de la agregación `$facet` de activos, a la forma de la respuesta. */
const armarActivos = ({ dau = 0, wau = 0, mau = 0, hoy }) => ({
  asOf: hoy,
  dau,
  wau,
  mau,
  // Pegajosidad: qué parte de los activos del mes entró hoy. `null` sin base.
  stickinessPct: porcentaje(dau, mau),
});

const idsExcluidos = async (condiciones) => {
  if (condiciones.length === 0) return [];
  const filas = await User.find({ $or: condiciones }).select("_id").limit(MAX_EXCLUIDOS).lean();
  return filas.map((f) => f._id);
};

/**
 * Todas las métricas de crecimiento para un rango (`days` / `from` / `to`, como el resto de los
 * paneles; por defecto los últimos 30 días, hasta 365).
 */
const consultarCrecimiento = async ({ days, from, to } = {}) => {
  const ahora = new Date();
  const hoy = diaDe(ahora);
  const rango = construirRango({ days, from, to, maxDias: MAX_DIAS });
  const desde = rango[0];
  const hasta = rango[rango.length - 1];
  const inicio = limitesDelDia(desde).inicio;
  const fin = limitesDelDia(hasta).fin;

  const condiciones = analytics.condicionesDeExclusion();
  const noExcluido = condiciones.length > 0 ? { $nor: condiciones } : {};
  const excluidos = await idsExcluidos(condiciones);
  const sinExcluidos = excluidos.length > 0 ? { $nin: excluidos } : null;
  const rx = condiciones.find((c) => c.email)?.email;

  // Para los activos: ventanas que terminan hoy (hoy, 7 días, 30 días).
  const dia7 = sumarDias(hoy, -6);
  const dia30 = sumarDias(hoy, -29);
  const filtroUsuario = { $ne: null, ...(sinExcluidos || {}) };

  const [cohorte, cuentas, activos, vinos, filasDiarias, bajas] = await Promise.all([
    User.find({ createdAt: { $gte: inicio, $lte: fin }, ...noExcluido })
      .select("+googleId createdAt emailVerified onboardedAt")
      .limit(MAX_COHORTE)
      .lean(),
    Promise.all([
      User.countDocuments({}),
      condiciones.length > 0 ? User.countDocuments({ $or: condiciones }) : 0,
    ]),
    AnalyticsEvent.aggregate([
      { $match: { day: { $gte: dia30, $lte: hoy }, userId: filtroUsuario } },
      { $group: { _id: { userId: "$userId", day: "$day" } } },
      {
        $facet: {
          dau: [{ $match: { "_id.day": hoy } }, { $group: { _id: "$_id.userId" } }, { $count: "n" }],
          wau: [{ $match: { "_id.day": { $gte: dia7 } } }, { $group: { _id: "$_id.userId" } }, { $count: "n" }],
          mau: [{ $group: { _id: "$_id.userId" } }, { $count: "n" }],
        },
      },
    ]),
    Wine.aggregate([
      { $match: { createdAt: { $gte: inicio, $lte: fin }, ...(sinExcluidos ? { userId: sinExcluidos } : {}) } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "-03:00" } },
          n: { $sum: 1 },
        },
      },
    ]),
    AnalyticsDaily.find({ day: { $gte: desde, $lte: hasta } }).select("day byType").lean(),
    ChangeLog.aggregate([
      {
        $match: {
          entityType: "user",
          action: "delete",
          createdAt: { $gte: inicio, $lte: fin },
          ...(rx ? { "before.email": { $not: rx } } : {}),
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "-03:00" } },
            self: { $eq: ["$before.selfDelete", true] },
          },
          n: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Activación: la fecha del primer vino de cada integrante de la cohorte.
  const usuarios = cohorte.map((u) => ({
    _id: u._id,
    createdAt: u.createdAt,
    emailVerified: Boolean(u.emailVerified),
    onboardedAt: u.onboardedAt,
    tieneGoogle: Boolean(u.googleId),
  }));
  const primerVino = new Map();
  if (usuarios.length > 0) {
    const primeros = await Wine.aggregate([
      { $match: { userId: { $in: usuarios.map((u) => u._id) } } },
      { $group: { _id: "$userId", primero: { $min: "$createdAt" } } },
    ]);
    for (const p of primeros) primerVino.set(String(p._id), p.primero);
  }

  const resumenCohorte = analizarCohorte({ usuarios, primerVino, rango, ahora });
  const f = activos[0] || {};
  const [total, excluidas] = cuentas;

  return {
    range: { days: rango.length, from: desde, to: hasta },
    accounts: { total, excluded: excluidas, real: Math.max(0, total - excluidas) },
    ...resumenCohorte,
    activeUsers: armarActivos({
      dau: f.dau?.[0]?.n || 0,
      wau: f.wau?.[0]?.n || 0,
      mau: f.mau?.[0]?.n || 0,
      hoy,
    }),
    accountDeletions: armarBajas({ rango, filas: bajas }),
    wines: armarSerieDeVinos({ rango, agregados: vinos, filasDiarias }),
  };
};

module.exports = {
  consultarCrecimiento,
  analizarCohorte,
  armarSerieDeVinos,
  armarBajas,
  armarActivos,
  porcentaje,
  MAX_DIAS,
};
