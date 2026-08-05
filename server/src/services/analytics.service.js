/**
 * Analytics propio: cuánta gente entra a Rincones y qué usa.
 *
 * ── POR QUÉ NO UN SERVICIO DE TERCEROS ──────────────────────────────────────
 * Los bloqueadores de publicidad tapan Google Analytics y compañía por defecto,
 * y el porcentaje bloqueado no es marginal. Justo el número que se quería saber
 * —cuánta gente entra— sale subestimado sin que nada avise. Esto viaja por el
 * mismo dominio que el resto de la API, así que no hay nada que bloquear.
 * De paso: los datos quedan en tu base, no hay cuentas ni costos nuevos, y sin
 * cookies ni almacenamiento local no hace falta cartel de consentimiento.
 *
 * ── CÓMO SE CUENTA UNA PERSONA SIN SABER QUIÉN ES ───────────────────────────
 * `visitorHash = sha256(IP + user-agent + ANALYTICS_SALT)`. Se calcula al
 * recibir el evento y es lo único que se guarda: la IP no toca la base. Sin el
 * salt no se puede volver atrás, y el salt vive sólo en el server.
 *
 * Es una aproximación honesta y hay que decir sus límites: dos personas en la
 * misma casa con el mismo teléfono cuentan como una, y la misma persona en wifi
 * y en datos cuenta como dos. Para "¿cuánta gente usa esto?" alcanza; para
 * facturarle a un anunciante, no.
 *
 * ── QUÉ SE ESCRIBE EN CADA EVENTO ───────────────────────────────────────────
 * Dos cosas, en paralelo: el evento crudo (caduca a los 180 días, sirve para
 * mirar de cerca) y el resumen del día (no caduca, sirve para ver la evolución).
 * Los únicos del día se resuelven con `$addToSet` sobre los hashes del día, que
 * es el único momento en que se pueden contar bien.
 */

const crypto = require("crypto");
const AnalyticsEvent = require("../models/analyticsEvent.model");
const AnalyticsDaily = require("../models/analyticsDaily.model");
const { peticionHumana } = require("../utils/trafficFilter");

/** Cuántos eventos distintos acepta una sola petición. */
const MAX_EVENTS_POR_LOTE = 20;

/** Media hora sin moverse y la sesión se considera terminada. */
const SESION_MS = 30 * 60 * 1000;

const salt = () =>
  process.env.ANALYTICS_SALT ||
  // Sin salt propio caemos al JWT_SECRET, que siempre está (lo exige env.js).
  // No es lo ideal —conviene uno dedicado— pero es mucho mejor que hashear sin
  // sal, que dejaría los hashes de IP adivinables con una tabla.
  process.env.JWT_SECRET ||
  "rincones";

const sha = (valor) => crypto.createHash("sha256").update(String(valor)).digest("hex").slice(0, 32);

/** El día de hoy como YYYY-MM-DD. */
const hoy = (fecha = new Date()) => fecha.toISOString().slice(0, 10);

/**
 * La IP del visitante. Detrás de Vercel llega en `x-forwarded-for`, que puede
 * traer varias separadas por coma: la primera es la del cliente.
 */
const ipDe = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "0.0.0.0";
};

const esMobile = (userAgent = "") =>
  /android|iphone|ipad|ipod|mobile|opera mini|iemobile/i.test(String(userAgent));

/** Sólo el host del referrer: alcanza para saber de dónde vino y no expone más. */
const hostDe = (url = "") => {
  const limpio = String(url || "").trim();
  if (!limpio) return "";
  try {
    return new URL(limpio).host.slice(0, 120);
  } catch {
    return "";
  }
};

/**
 * La pantalla, con los ids reemplazados por ":id".
 *
 * Sin esto, `/vino/687f2a…` sería una fila distinta por cada vino de cada
 * usuario: la tabla de "pantallas más usadas" tendría miles de filas de una
 * visita y ninguna respondería nada. Además saca de la base identificadores que
 * no hacen falta para contar.
 */
const normalizarPath = (valor = "") => {
  const limpio = String(valor || "/").split("?")[0].split("#")[0].trim() || "/";
  return limpio
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id") // ObjectId de Mongo
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .slice(0, 200)
    .toLowerCase();
};

/**
 * Identidad anónima del visitante y de su sesión.
 *
 * La sesión mete la ventana de media hora DENTRO del hash: al pasar a la
 * siguiente ventana el hash cambia solo, así que no hay que guardar estado de
 * sesión en ningún lado ni expirar nada a mano.
 */
const identificar = (req) => {
  const ip = ipDe(req);
  const ua = String(req.headers["user-agent"] || "");
  const visitorHash = sha(`${ip}|${ua}|${salt()}`);
  // El bloque de media hora del reloj en el que cae este evento. Ver SESION_MS.
  const ventana = Math.floor(Date.now() / SESION_MS);
  return {
    visitorHash,
    sessionHash: sha(`${visitorHash}|${ventana}`),
    device: ua ? (esMobile(ua) ? "mobile" : "desktop") : "unknown",
  };
};

/**
 * Nombre de campo usable dentro de un objeto de Mongo.
 *
 * El punto y el `$` se reemplazan porque en una ruta de `$inc` significan otra
 * cosa: "byPath./bodega" con un punto adentro crearía un objeto anidado en vez de
 * una clave, y el contador quedaría en un lugar que nadie lee.
 */
const claveMapa = (valor) =>
  String(valor || "otro").replace(/[.$]/g, "_").slice(0, 80) || "otro";

/**
 * Registra un lote de eventos. NUNCA lanza y nunca frena al usuario: si esto
 * falla, la app tiene que seguir funcionando igual. Medir es una mejora, no un
 * requisito de nada.
 */
const track = async (req, eventos = []) => {
  const lote = (Array.isArray(eventos) ? eventos : [eventos])
    .filter((e) => e && typeof e === "object" && String(e.type || "").trim())
    .slice(0, MAX_EVENTS_POR_LOTE);

  if (lote.length === 0) return { accepted: 0 };

  // El mismo filtro que usan las campañas, a propósito: si cada uno tuviera el
  // suyo, el panel diría dos verdades distintas sobre el mismo tráfico.
  if (!peticionHumana(req)) return { accepted: 0 };

  const { visitorHash, sessionHash, device } = identificar(req);
  const day = hoy();
  const referrer = hostDe(req.headers.referer || req.headers.referrer);
  const userId = req.user?.id || null;

  const documentos = lote.map((e) => ({
    type: String(e.type).trim().slice(0, 60),
    path: normalizarPath(e.path),
    day,
    visitorHash,
    sessionHash,
    userId,
    device,
    referrer,
    // El meta se recorta a lo que quepa: es contexto, no un canal para subir
    // cosas. Se serializa y se corta antes de llegar a la base.
    meta: e.meta && typeof e.meta === "object" ? recortarMeta(e.meta) : undefined,
    createdAt: new Date(),
  }));

  try {
    await AnalyticsEvent.insertMany(documentos, { ordered: false });
  } catch {
    // Un evento perdido no es un problema; que se caiga la app, sí.
  }

  await actualizarResumen({ day, visitorHash, sessionHash, userId, device, documentos });

  return { accepted: documentos.length };
};

/** Hasta 10 claves y valores cortos: el meta es contexto, no carga útil. */
const recortarMeta = (meta) => {
  const salida = {};
  for (const [k, v] of Object.entries(meta).slice(0, 10)) {
    const clave = String(k).replace(/[.$]/g, "_").slice(0, 40);
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "boolean") salida[clave] = v;
    else salida[clave] = String(v).slice(0, 200);
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
};

/**
 * Suma el lote al resumen del día.
 *
 * Lo que se cuenta en VISITAS (vistas, eventos por tipo, por pantalla) se suma
 * con `$inc`, porque cada visita cuenta.
 *
 * Lo que se cuenta en PERSONAS (visitantes, sesiones, cuántos con sesión
 * abierta) NO se puede sumar: la misma persona abriendo diez pantallas es una
 * persona, y con `$inc` serían diez. Esos tres van a un set con `$addToSet` y el
 * número sale del tamaño del set, que es la única forma de que no se infle. Es
 * exactamente el error que hace que un tablero hecho a mano reporte el triple de
 * usuarios que tiene.
 */
const actualizarResumen = async ({ day, visitorHash, sessionHash, userId, device, documentos }) => {
  try {
    const vistas = documentos.filter((d) => d.type === "pageview").length;

    const inc = {};
    if (vistas > 0) {
      inc.views = vistas;
      if (device === "mobile" || device === "desktop") inc[device] = vistas;
    }
    for (const d of documentos) {
      const kt = `byType.${claveMapa(d.type)}`;
      inc[kt] = (inc[kt] || 0) + 1;
      if (d.type === "pageview" && d.path) {
        const kp = `byPath.${claveMapa(d.path)}`;
        inc[kp] = (inc[kp] || 0) + 1;
      }
    }

    const addToSet = { visitors: visitorHash, sessionHashes: sessionHash };
    if (userId) addToSet.loggedInVisitors = visitorHash;

    const update = { $addToSet: addToSet, $set: { updatedAt: new Date() } };
    if (Object.keys(inc).length > 0) update.$inc = inc;

    const doc = await AnalyticsDaily.findOneAndUpdate({ day }, update, {
      upsert: true,
      returnDocument: "after",
    }).select("+visitors +sessionHashes +loggedInVisitors");

    if (!doc) return;

    // Los contadores se sincronizan con el tamaño de cada set. Quedan
    // materializados para que el panel no tenga que traer los hashes, y para que
    // el número sobreviva cuando los sets se vacíen por antigüedad.
    const tamaño = (arr) => (Array.isArray(arr) ? arr.length : 0);
    const cambios = {
      visitorCount: tamaño(doc.visitors),
      sessions: tamaño(doc.sessionHashes),
      loggedIn: tamaño(doc.loggedInVisitors),
    };

    const hayCambios = Object.entries(cambios).some(([k, v]) => doc[k] !== v);
    if (hayCambios) await AnalyticsDaily.updateOne({ day }, { $set: cambios });
  } catch {
    // Idem: el resumen es una comodidad de lectura, no la verdad. Si falla, los
    // eventos crudos ya quedaron guardados y el número se puede recalcular.
  }
};

/** Los últimos N días como YYYY-MM-DD, del más viejo al más nuevo. */
const ultimosDias = (n) => {
  const dias = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dias.push(hoy(d));
  }
  return dias;
};

/**
 * El resumen para el panel: la evolución día por día y los totales del período.
 *
 * Los visitantes únicos del período NO son la suma de los diarios (la misma
 * persona entrando lunes y martes es una, no dos), así que se cuentan aparte
 * sobre los eventos crudos. Es la diferencia entre un número correcto y uno
 * inflado, y es justo la que suele estar mal en los tableros hechos a mano.
 */
const getSummary = async ({ days = 30 } = {}) => {
  // El techo es 180 días porque es lo que viven los eventos crudos, y tres de
  // los cuatro cuadros del panel (pantallas, tipos, orígenes) salen de ellos.
  // Aceptar un rango mayor devolvería listas recortadas sin decir que lo están:
  // se leerían como "nadie llegó desde otro sitio" cuando en realidad el dato
  // caducó. Es mejor no ofrecer el rango que ofrecerlo mintiendo.
  const rango = ultimosDias(Math.min(Math.max(Number(days) || 30, 1), 180));
  const desde = rango[0];

  const filas = await AnalyticsDaily.find({ day: { $gte: desde } }).sort({ day: 1 }).lean();
  const porDia = new Map(filas.map((f) => [f.day, f]));

  const serie = rango.map((day) => {
    const f = porDia.get(day);
    return {
      day,
      views: f?.views || 0,
      visitors: f?.visitorCount || 0,
      sessions: f?.sessions || 0,
    };
  });

  const [unicosDelPeriodo] = await AnalyticsEvent.aggregate([
    { $match: { day: { $gte: desde } } },
    { $group: { _id: "$visitorHash" } },
    { $count: "total" },
  ]);

  const topPantallas = await AnalyticsEvent.aggregate([
    { $match: { day: { $gte: desde }, type: "pageview", path: { $ne: "" } } },
    { $group: { _id: "$path", views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: 10 },
  ]);

  const porTipo = await AnalyticsEvent.aggregate([
    { $match: { day: { $gte: desde } } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
  ]);

  const porOrigen = await AnalyticsEvent.aggregate([
    { $match: { day: { $gte: desde }, referrer: { $nin: ["", null] } } },
    { $group: { _id: "$referrer", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  const sumar = (campo) => filas.reduce((n, f) => n + (f[campo] || 0), 0);
  const dispositivos = { mobile: sumar("mobile"), desktop: sumar("desktop") };

  return {
    range: { days: rango.length, from: desde, to: rango[rango.length - 1] },
    totals: {
      views: sumar("views"),
      sessions: sumar("sessions"),
      // El número de la pregunta original: cuánta gente distinta entró.
      visitors: unicosDelPeriodo?.total || 0,
      today: porDia.get(hoy())?.visitorCount || 0,
    },
    daily: serie,
    devices: dispositivos,
    topPaths: topPantallas.map((r) => ({ path: r._id, views: r.views })),
    byType: porTipo.map((r) => ({ type: r._id, count: r.count })),
    referrers: porOrigen.map((r) => ({ host: r._id, count: r.count })),
  };
};

module.exports = {
  track,
  getSummary,
  // Exportados para los tests: son las dos piezas con reglas propias.
  normalizarPath,
  identificar,
};
