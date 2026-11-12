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
const { construirRango } = require("../utils/dateRange");
const { peticionHumana } = require("../utils/trafficFilter");

/** Cuántos eventos distintos acepta una sola petición. */
const MAX_EVENTS_POR_LOTE = 20;

/**
 * Cuánto viven los eventos crudos. Es el TTL declarado en el modelo, repetido
 * acá para poder avisar cuándo un rango se pasa de lo que se puede contar exacto.
 */
const DIAS_DE_EVENTOS = 180;

/**
 * El rango más largo que se puede pedir. Ahora que los cuadros salen del resumen
 * diario —que no caduca— se puede mirar dos años sin que falte nada.
 */
const MAX_DIAS = 730;

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

/**
 * El día y la hora en Argentina.
 *
 * El corte del día se hace en hora local y no en UTC: para quien mira el panel,
 * lo de anoche a las 22 pasó ayer, no hoy. Con UTC, todo lo que ocurre entre las
 * 21 y la medianoche cae al día siguiente y la serie diaria queda corrida.
 */
const OFFSET_AR_MINUTOS = -180;

const enArgentina = (fecha = new Date()) =>
  new Date(fecha.getTime() + OFFSET_AR_MINUTOS * 60 * 1000);

/** El día de hoy como YYYY-MM-DD, en calendario argentino. */
const hoy = (fecha = new Date()) => enArgentina(fecha).toISOString().slice(0, 10);

/** La hora del día (0-23), en hora argentina. */
const horaDe = (fecha = new Date()) => enArgentina(fecha).getUTCHours();

/**
 * La IP del visitante. Detrás de Vercel llega en `x-forwarded-for`, que puede
 * traer varias separadas por coma: la primera es la del cliente.
 */
const ipDe = (req) => {
  // `req.ip` y no la cabecera cruda: con `trust proxy` Express ya toma la IP que puso el proxy
  // de confianza. La PRIMERA entrada de `x-forwarded-for` la escribe el cliente, y cualquiera
  // podía fabricar visitantes distintos (o saltearse el hash) mandando la que quisiera.
  return req.ip || req.socket?.remoteAddress || "0.0.0.0";
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
// Forma de un nombre de evento (pageview, wine_added, sommelier:ask...): letras, números y _ : . -.
// No es una lista cerrada a propósito —el cliente suma eventos sin tocar el servidor—, pero
// impide sembrar claves arbitrarias en los contadores.
const TIPO_VALIDO = /^[a-z0-9][a-z0-9_:.-]{0,59}$/i;

const track = async (req, eventos = []) => {
  const lote = (Array.isArray(eventos) ? eventos : [eventos])
    .filter((e) => e && typeof e === "object" && TIPO_VALIDO.test(String(e.type || "").trim()))
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

    // De dónde llegó y a qué hora, en el resumen que no caduca. Antes los dos
    // salían de los eventos crudos, que se borran a los 180 días: el panel
    // contestaba "de nadie y de ninguna hora" en vez de "no tengo el dato".
    const referrer = documentos[0]?.referrer;
    if (referrer) inc[`byReferrer.${claveMapa(referrer)}`] = documentos.length;
    inc[`byHour.${horaDe()}`] = (inc[`byHour.${horaDe()}`] || 0) + documentos.length;

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


/**
 * El resumen para el panel: la evolución día por día y los totales del período.
 *
 * Los visitantes únicos del período NO son la suma de los diarios (la misma
 * persona entrando lunes y martes es una, no dos), así que se cuentan aparte
 * sobre los eventos crudos. Es la diferencia entre un número correcto y uno
 * inflado, y es justo la que suele estar mal en los tableros hechos a mano.
 */
const getSummary = async ({ days = 30, from = "", to = "" } = {}) => {
  /**
   * ── POR QUÉ ESTO LEE LOS ACUMULADOS Y YA NO LOS EVENTOS CRUDOS ────────────
   * Porque los eventos crudos caducan a los 180 días y tres de los cuadros del
   * panel salían de ellos. El efecto no era un error visible: era que a los seis
   * meses "de dónde llegan" empezaba a vaciarse sola y se leía como "no llegó
   * nadie de ningún lado". Un dato que caducó y un dato que es cero se ven
   * exactamente igual, y ése es el peor tipo de número.
   *
   * Ahora pantallas, tipos, orígenes y horarios salen del resumen diario, que no
   * caduca. Eso además destraba los rangos largos: se puede mirar un año, o dos,
   * que es lo que uno quiere cuando la app ya lleva un tiempo andando.
   *
   * La única excepción son los visitantes únicos DEL PERÍODO, que siguen saliendo
   * de los eventos: contar personas distintas a lo largo de varios días exige
   * cruzar sus hashes, y eso sólo está en el evento. Con rangos más largos que la
   * retención, se avisa en la respuesta (`visitorsExact`) en vez de devolver un
   * número corto sin decirlo.
   */
  // Un rango elegido a mano (from/to) o los últimos N días. Ver utils/dateRange.
  const rango = construirRango({ days, from, to, maxDias: MAX_DIAS });
  const desde = rango[0];
  const hasta = rango[rango.length - 1];

  // Las dos puntas: con un rango elegido a mano, un `$gte` suelto traería todo
  // lo posterior y los totales incluirían días fuera del período informado.
  const filas = await AnalyticsDaily.find({ day: { $gte: desde, $lte: hasta } })
    .sort({ day: 1 })
    .lean();
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

  /** Suma los mapas `byAlgo` de todos los días del rango, ordenado y recortado. */
  const ranking = (campo, limite) => {
    const total = new Map();
    for (const f of filas) {
      for (const [clave, n] of Object.entries(f?.[campo] || {})) {
        total.set(clave, (total.get(clave) || 0) + (Number(n) || 0));
      }
    }
    return [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite)
      .map(([clave, count]) => ({ clave, count }));
  };

  // Los únicos del período: hay que cruzar hashes entre días y eso sólo vive en
  // el evento crudo. Si el rango se pasa de la retención, el número queda corto
  // y la respuesta lo dice en vez de disimularlo.
  const dentroDeRetencion = rango.length <= DIAS_DE_EVENTOS;
  const [unicosDelPeriodo] = await AnalyticsEvent.aggregate([
    { $match: { day: { $gte: desde, $lte: hasta } } },
    { $group: { _id: "$visitorHash" } },
    { $count: "total" },
  ]);

  const sumar = (campo) => filas.reduce((n, f) => n + (f[campo] || 0), 0);

  // Las 24 horas siempre presentes, aunque alguna esté en cero: un gráfico al que
  // le faltan las horas sin actividad miente sobre la forma del día.
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const f of filas) {
    for (const [h, n] of Object.entries(f?.byHour || {})) {
      const i = Number(h);
      if (Number.isInteger(i) && i >= 0 && i < 24) porHora[i].count += Number(n) || 0;
    }
  }

  return {
    range: { days: rango.length, from: desde, to: hasta },
    totals: {
      views: sumar("views"),
      sessions: sumar("sessions"),
      visitors: unicosDelPeriodo?.total || 0,
      today: porDia.get(hoy())?.visitorCount || 0,
      // Falso cuando el rango se pasa de lo que viven los eventos: el panel lo
      // aclara en vez de mostrar un número corto como si fuera exacto.
      visitorsExact: dentroDeRetencion,
    },
    daily: serie,
    devices: { mobile: sumar("mobile"), desktop: sumar("desktop") },
    topPaths: ranking("byPath", 10).map((r) => ({ path: r.clave, views: r.count })),
    byType: ranking("byType", 15).map((r) => ({ type: r.clave, count: r.count })),
    // Los puntos se guardan como "_" porque en una ruta de `$inc` significan
    // "objeto anidado". Se devuelven como el host que son: "instagram_com" en el
    // panel se lee como un dato mal guardado, no como Instagram.
    referrers: ranking("byReferrer", 8).map((r) => ({
      host: r.clave.replace(/_/g, "."),
      count: r.count,
    })),
    byHour: porHora,
  };
};

module.exports = {
  track,
  getSummary,
  // Exportados para los tests: son las piezas con reglas propias.
  normalizarPath,
  identificar,
  hoy,
  horaDe,
  DIAS_DE_EVENTOS,
  MAX_DIAS,
};
