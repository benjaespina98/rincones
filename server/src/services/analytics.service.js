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
const { construirRango, sumarDias } = require("../utils/dateRange");
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
// Largo y charset de un path ya normalizado. Esta ruta es pública: sin tope, cualquiera
// siembra claves arbitrarias en `byPath` y en los eventos crudos.
const PATH_MAX = 120;
const PATH_VALIDO = /^\/[a-z0-9/_:.~%-]*$/;

const normalizarPath = (valor = "") => {
  const limpio = String(valor || "/").split("?")[0].split("#")[0].trim().slice(0, 400) || "/";
  const normal = limpio
    // El token del informe es un secreto de portador: no puede quedar en la base.
    .replace(/^\/informe\/[^/]+/i, "/informe/:token")
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id") // ObjectId de Mongo
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .toLowerCase();
  if (normal.length > PATH_MAX || !PATH_VALIDO.test(normal)) return "/otro";
  return normal;
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
// El client sólo usa snake_case (pageview, wine_added, sommelier_ask...), así que la forma es
// estricta: minúsculas, dígitos y _, hasta 40. Sin ":" ni "." que en una ruta de `$inc` molestan.
const TIPO_VALIDO = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Eventos que el client manda de verdad (grep `trackEvent` en client/src). Están EXENTOS del tope de
 * claves de `byType`: si no, alguien que siembra 60 tipos inventados en `/collect` desplaza a los
 * legítimos a "otro" y el panel pierde justo los números que importan. El tope sólo cuenta las
 * claves desconocidas.
 */
const TIPOS_CONOCIDOS = new Set([
  "pageview",
  "cafecito_click",
  "promo_click",
  "wine_added",
  "stock_added",
  "bottle_opened",
  "wish_added",
  "scan_consult",
  "sommelier_ask",
  "sommelier_feedback",
  "sommelier_followup_click",
  "sommelier_historial_abrir",
  "sommelier_otra_opcion",
  "sommelier_recipe",
  "sommelier_reset",
  "sommelier_retry",
]);

/** Tope de claves distintas por día en cada mapa: lo que pase se junta en "otro". */
const MAX_CLAVES_TYPE = 60;
const MAX_CLAVES_PATH = 150;
const MAX_CLAVES_REFERRER = 100;

/** Host válido de un referrer: sólo caracteres de hostname. */
const HOST_VALIDO = /^[a-z0-9.-]+(:\d{1,5})?$/i;
const hostReferrer = (url) => {
  const host = hostDe(url).toLowerCase();
  return HOST_VALIDO.test(host) ? host : "";
};

/**
 * ── TOPES DE `/collect` (ruta pública: cualquiera puede mandar basura) ─────
 * Los sets de hashes del día tienen techo. Cuando se llena, un visitante NUEVO ya no se agrega
 * (y su evento se descarta): sin tope, un script con IPs/UAs rotativos infla el documento del día
 * sin límite y mete visitantes falsos. Los visitantes ya conocidos siguen contando normal.
 * Se pueden mover con variables de entorno (ANALYTICS_MAX_VISITANTES_DIA, ANALYTICS_MAX_SESIONES_DIA).
 */
const entero = (valor, porDefecto) => {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};
const LIMITE_VISITANTES_DIA = 5000;
const LIMITE_SESIONES_DIA = 20000;
/**
 * Cupo APARTE para quien tiene la sesión abierta. El tope de arriba es para anónimos: se llena con
 * sólo rotar el User-Agent desde una IP (el hash es IP+UA) y, sin esta reserva, desde ese momento se
 * descartaban los eventos de los usuarios reales logueados. Los de sesión cuentan contra tope + reserva
 * (el documento del día sigue teniendo techo).
 */
const RESERVA_LOGUEADOS_DIA = 5000;
/** Visitantes NUEVOS que una misma IP puede sumar por día (ver `excedeTopeIp`). */
const LIMITE_NUEVOS_POR_IP_DIA = 20;
const limiteVisitantes = () => entero(process.env.ANALYTICS_MAX_VISITANTES_DIA, LIMITE_VISITANTES_DIA);
const limiteSesiones = () => entero(process.env.ANALYTICS_MAX_SESIONES_DIA, LIMITE_SESIONES_DIA);
const reservaLogueados = () => entero(process.env.ANALYTICS_RESERVA_LOGUEADOS_DIA, RESERVA_LOGUEADOS_DIA);
const limiteNuevosPorIp = () => entero(process.env.ANALYTICS_MAX_NUEVOS_POR_IP_DIA, LIMITE_NUEVOS_POR_IP_DIA);

/** Techos efectivos: los de sesión abierta suman la reserva. */
const techoVisitantes = (conSesion) => limiteVisitantes() + (conSesion ? reservaLogueados() : 0);
const techoSesiones = (conSesion) => limiteSesiones() + (conSesion ? reservaLogueados() : 0);

/**
 * ¿El día ya no admite visitantes nuevos? `existente` es el resumen del día (contadores).
 * `conSesion`: el evento viene de alguien logueado, que tiene su reserva (ver `RESERVA_LOGUEADOS_DIA`).
 */
const superaTope = (existente, conSesion = false) =>
  (existente?.visitorCount || 0) >= techoVisitantes(conSesion) ||
  (existente?.sessions || 0) >= techoSesiones(conSesion);

/**
 * El `$addToSet` del lote, respetando los topes: un set lleno sólo deja de crecer.
 * Función pura.
 */
const armarAddToSet = ({ visitorHash, sessionHash, userId, existente }) => {
  const conSesion = Boolean(userId);
  const addToSet = {};
  if ((existente?.visitorCount || 0) < techoVisitantes(conSesion)) addToSet.visitors = visitorHash;
  if ((existente?.sessions || 0) < techoSesiones(conSesion)) addToSet.sessionHashes = sessionHash;
  if (userId && (existente?.loggedIn || 0) < techoVisitantes(true)) addToSet.loggedInVisitors = visitorHash;
  return addToSet;
};

/**
 * Tope de visitantes NUEVOS por IP y por día. El hash es IP+UA, así que quien rota el User-Agent desde
 * una sola IP fabrica visitantes sin límite y llena el set del día. Se cuenta en memoria, por instancia
 * (la IP no se guarda en la base: acá sólo vive su hash, y se pierde con la instancia). En serverless el
 * tope real es "N por instancia": no frena a un atacante con muchas IPs (eso lo frena el rate-limit de
 * la ruta), sí al script de una sola. Un visitante que esa IP ya trajo hoy sigue contando normal.
 */
const MAX_IPS_EN_MEMORIA = 20000;
const nuevosPorIp = new Map(); // `${day}|${ipHash}` -> Set<visitorHash>

const excedeTopeIp = (req, day, visitorHash) => {
  const clave = `${day}|${sha(`${ipDe(req)}|${salt()}`)}`;
  let vistos = nuevosPorIp.get(clave);
  if (!vistos) {
    if (nuevosPorIp.size >= MAX_IPS_EN_MEMORIA) {
      // Primero los de días anteriores; si no alcanza, el más viejo (el Map conserva el orden de alta).
      for (const k of nuevosPorIp.keys()) if (!k.startsWith(`${day}|`)) nuevosPorIp.delete(k);
      if (nuevosPorIp.size >= MAX_IPS_EN_MEMORIA) nuevosPorIp.delete(nuevosPorIp.keys().next().value);
    }
    vistos = new Set();
    nuevosPorIp.set(clave, vistos);
  }
  if (vistos.has(visitorHash)) return false;
  if (vistos.size >= limiteNuevosPorIp()) return true;
  vistos.add(visitorHash);
  return false;
};

/** Sólo para tests: vacía la memoria del tope por IP. */
const _reiniciarTopesIp = () => nuevosPorIp.clear();

/**
 * ── CUENTAS QUE NO SE MIDEN ────────────────────────────────────────────────
 * Un admin navegando el panel o una cuenta de prueba no son uso real: inflan visitantes, vistas y
 * activos. Se excluyen del tracking (con sesión abierta; un admin sin loguear es anónimo y no se
 * puede distinguir) y de las métricas de usuarios. Configurable por entorno:
 *   ANALYTICS_EXCLUIR_ADMINS   "0" / "false" para volver a medir admins (por defecto se excluyen).
 *   ANALYTICS_EXCLUIR_DOMINIOS dominios de email separados por coma (por defecto "example.test",
 *                              el de las cuentas de QA/E2E). Vacío = ninguno.
 * El rol sale del token (el de cuando inició sesión): un admin recién promovido se mide hasta que
 * vuelva a entrar.
 */
const excluyeAdmins = (env = process.env) =>
  !/^(0|false|no)$/i.test(String(env.ANALYTICS_EXCLUIR_ADMINS ?? "1").trim());
const dominiosExcluidos = (env = process.env) =>
  String(env.ANALYTICS_EXCLUIR_DOMINIOS ?? "example.test")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

/** ¿Esta cuenta ({ email, role }) queda afuera de las métricas? */
const esCuentaExcluida = (cuenta, env = process.env) => {
  if (!cuenta) return false;
  if (cuenta.role === "admin" && excluyeAdmins(env)) return true;
  const email = String(cuenta.email || "").toLowerCase();
  return dominiosExcluidos(env).some((d) => email.endsWith(`@${d}`));
};

const escapeRx = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Las mismas reglas como condiciones de Mongo para `User` (se combinan con `$or` o `$nor`). */
const condicionesDeExclusion = (env = process.env) => {
  const condiciones = [];
  if (excluyeAdmins(env)) condiciones.push({ role: "admin" });
  const dominios = dominiosExcluidos(env);
  if (dominios.length > 0) {
    condiciones.push({ email: new RegExp(`@(${dominios.map(escapeRx).join("|")})$`, "i") });
  }
  return condiciones;
};

const track = async (req, eventos = []) => {
  const lote = (Array.isArray(eventos) ? eventos : [eventos])
    .filter((e) => e && typeof e === "object" && typeof e.type === "string" && TIPO_VALIDO.test(e.type))
    .slice(0, MAX_EVENTS_POR_LOTE);

  if (lote.length === 0) return { accepted: 0 };

  // El mismo filtro que usan las campañas, a propósito: si cada uno tuviera el
  // suyo, el panel diría dos verdades distintas sobre el mismo tráfico.
  if (!peticionHumana(req)) return { accepted: 0 };

  // Admins y cuentas de prueba no cuentan (ver `esCuentaExcluida`).
  if (esCuentaExcluida(req.user)) return { accepted: 0 };

  const { visitorHash, sessionHash, device } = identificar(req);
  const day = hoy();
  const userId = req.user?.id || null;
  // Un visitante nuevo más allá del cupo de su IP se descarta antes de tocar la base.
  if (excedeTopeIp(req, day, visitorHash)) return { accepted: 0 };
  // El header Referer de esta petición es el origen de la propia app, no de dónde llegó la
  // persona: el referrer real lo manda el client (document.referrer) dentro del evento.
  const propios = new Set(
    [req.headers.host, hostDe(req.headers.origin), hostDe(req.headers.referer)]
      .filter(Boolean)
      .map((h) => String(h).toLowerCase())
  );
  const referrerDe = (e) => {
    const host = e.type === "pageview" && typeof e.referrer === "string" ? hostReferrer(e.referrer) : "";
    return host && !propios.has(host) ? host : "";
  };

  // El resumen del día se lee UNA vez: sirve para el tope de visitantes y para el de claves por mapa.
  let existente = null;
  try {
    existente = await AnalyticsDaily.findOne({ day })
      .select("visitorCount sessions loggedIn byType byPath byReferrer")
      .lean();
  } catch {
    // Sin lectura se sigue sin topes: medir no puede romper nada.
  }
  if (superaTope(existente, Boolean(userId))) {
    // Día lleno (para su clase: anónimo o con sesión): sólo siguen contando los que ya estaban en el set.
    let conocido = false;
    try {
      conocido = Boolean(await AnalyticsDaily.exists({ day, visitors: visitorHash }));
    } catch {
      conocido = false;
    }
    if (!conocido) return { accepted: 0 };
  }

  const documentos = lote.map((e) => ({
    type: e.type,
    path: normalizarPath(e.path),
    day,
    visitorHash,
    sessionHash,
    userId,
    device,
    referrer: referrerDe(e),
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

  await actualizarResumen({ day, visitorHash, sessionHash, userId, device, documentos, existente });

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
 * Los `$inc` de un lote. Función pura para poder probar las reglas sin base:
 *  - cada visita cuenta 1 (no el tamaño del lote);
 *  - el origen (referrer) suma 1 por visita, la que lo trae;
 *  - un mapa del día no pasa de N claves distintas: la clave nueva que lo exceda va a "otro".
 */
const armarIncrementos = ({ documentos, device, existentes = {}, hora }) => {
  const inc = {};
  const vistas = documentos.filter((d) => d.type === "pageview").length;
  if (vistas > 0) {
    inc.views = vistas;
    if (device === "mobile" || device === "desktop") inc[device] = vistas;
  }

  // Claves ya presentes (o ya reservadas en este mismo lote) por mapa.
  const claves = (campo) => new Set(Object.keys(existentes?.[campo] || {}));
  const vistos = { byType: claves("byType"), byPath: claves("byPath"), byReferrer: claves("byReferrer") };
  const topes = { byType: MAX_CLAVES_TYPE, byPath: MAX_CLAVES_PATH, byReferrer: MAX_CLAVES_REFERRER };
  const sumar = (campo, valor) => {
    let clave = claveMapa(valor);
    if (!vistos[campo].has(clave)) {
      // Los tipos legítimos conocidos no cuentan para el tope ni se desplazan a "otro".
      const exenta = campo === "byType" && TIPOS_CONOCIDOS.has(clave);
      if (!exenta) {
        const ocupadas =
          campo === "byType"
            ? [...vistos.byType].filter((k) => !TIPOS_CONOCIDOS.has(k)).length
            : vistos[campo].size;
        if (ocupadas >= topes[campo]) clave = "otro";
      }
      vistos[campo].add(clave);
    }
    const k = `${campo}.${clave}`;
    inc[k] = (inc[k] || 0) + 1;
  };

  for (const d of documentos) {
    sumar("byType", d.type);
    if (d.type === "pageview" && d.path) sumar("byPath", d.path);
    if (d.referrer) sumar("byReferrer", d.referrer);
  }

  // A qué hora, en el resumen que no caduca (los eventos crudos se borran a los 180 días).
  inc[`byHour.${hora}`] = (inc[`byHour.${hora}`] || 0) + documentos.length;
  return inc;
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
const actualizarResumen = async ({
  day,
  visitorHash,
  sessionHash,
  userId,
  device,
  documentos,
  existente = null,
}) => {
  try {
    // `existente` trae los mapas del día para el tope de claves.
    const inc = armarIncrementos({ documentos, device, existentes: existente, hora: horaDe() });

    const addToSet = armarAddToSet({ visitorHash, sessionHash, userId, existente });

    const update = { $set: { updatedAt: new Date() } };
    if (Object.keys(addToSet).length > 0) update.$addToSet = addToSet;
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

    await cerrarDiasAnteriores(day);
  } catch (error) {
    // Idem: el resumen es una comodidad de lectura, no la verdad. Si falla, los
    // eventos crudos ya quedaron guardados y el número se puede recalcular. Se deja rastro:
    // un resumen que falla siempre (como pasó con updatePipeline) no puede ser invisible.
    console.error("Analytics: no se pudo actualizar el resumen del día:", error?.message || error);
  }
};

/**
 * Cierra los días anteriores a ayer: vacía sus sets de hashes y deja los contadores (ver el modelo).
 * Corre a lo sumo una vez por día y por instancia. Antes de vaciar, sincroniza los contadores con
 * el tamaño del set (que es la verdad mientras el día está abierto), salvo que el set ya esté vacío.
 */
let ultimoCierre = "";
/** Sólo para tests: olvida el memo del día para poder correr el cierre de nuevo. */
const _reiniciarCierre = () => {
  ultimoCierre = "";
};
/**
 * Mongoose 9 rechaza un update con pipeline (array) si no se le pasa `{ updatePipeline: true }`: sin esto
 * `cerrarDiasAnteriores` nunca cerraba nada y `olvidarUsuario` tiraba 500. Todo update con pipeline de este
 * archivo tiene que llevar estas opciones (hay un test que lo exige).
 */
const OPCIONES_PIPELINE = Object.freeze({ updatePipeline: true });

const cerrarDiasAnteriores = async (hoyDia) => {
  if (ultimoCierre === hoyDia) return;
  ultimoCierre = hoyDia;
  const tam = (campo) => ({ $size: { $ifNull: [`$${campo}`, []] } });
  const sync = (contador, campo) => ({
    $cond: [{ $gt: [tam(campo), 0] }, tam(campo), { $ifNull: [`$${contador}`, 0] }],
  });
  try {
    await AnalyticsDaily.updateMany({ day: { $lt: sumarDias(hoyDia, -1) }, closed: { $ne: true } }, [
      {
        $set: {
          visitorCount: sync("visitorCount", "visitors"),
          sessions: sync("sessions", "sessionHashes"),
          loggedIn: sync("loggedIn", "loggedInVisitors"),
        },
      },
      { $set: { visitors: [], sessionHashes: [], loggedInVisitors: [], closed: true } },
    ], OPCIONES_PIPELINE);
  } catch (error) {
    // Se reintenta en el próximo evento; un día sin cerrar sólo guarda hashes de más. Pero que NO sea en
    // silencio: este catch escondió que el cierre nunca corría (faltaba updatePipeline).
    console.error("Analytics: no se pudieron cerrar los días anteriores:", error?.message || error);
    ultimoCierre = "";
  }
};

/**
 * ── OLVIDAR A UNA PERSONA (baja de cuenta) ─────────────────────────────────
 * Borrar sus eventos por `userId` no alcanza: el resumen del día conserva el hash en los sets y en
 * los contadores, y quedaría para siempre (privacidad) y el total del período dejaría de coincidir
 * con la serie diaria. Se hace así:
 *   1. se buscan los (día, visitorHash) de sus eventos;
 *   2. de esos pares se juntan los sessionHash de TODOS los eventos del mismo hash;
 *   3. en cada día se sacan los hashes de los sets (día abierto: el contador se recalcula del
 *      set) o se descuenta de los contadores (día cerrado, sin sets);
 *   4. se borran los eventos de la persona y los del mismo (día, hash), para que el total del
 *      período (que cuenta hashes sobre los eventos) coincida con los diarios.
 * Costo: otra persona detrás de la misma IP+navegador deja de contar ese día (el hash no las
 * distingue). Lanza si la base falla: el que llama decide si reintenta (la baja no avanza a medias).
 */
const planearOlvido = (eventosDeLaPersona, eventosDeLosHashes = []) => {
  const plan = new Map();
  const dia = (day) => {
    if (!plan.has(day)) plan.set(day, { hashes: new Set(), sessions: new Set() });
    return plan.get(day);
  };
  for (const e of eventosDeLaPersona) {
    if (e?.day && e.visitorHash) dia(e.day).hashes.add(e.visitorHash);
  }
  for (const e of eventosDeLosHashes) {
    const p = plan.get(e?.day);
    if (p && p.hashes.has(e.visitorHash) && e.sessionHash) p.sessions.add(e.sessionHash);
  }
  return plan;
};

/**
 * Pipeline de actualización de UN día para sacar `hashes` y `sessions` (ver `olvidarUsuario`).
 * `modo` separa lo idempotente de lo que no lo es:
 *   - "abiertos": saca los hashes de los sets y recalcula los contadores desde el set. Repetirlo da lo
 *     mismo, así que se puede reintentar sin riesgo. No toca los contadores de días cerrados.
 *   - "cerrados": descuenta de los contadores (el día cerrado ya no tiene sets). NO es idempotente: correrlo
 *     dos veces descuenta dos veces. Sólo se corre después de que el borrado de eventos borró algo.
 *   - "ambos" (por defecto): las dos cosas.
 */
const pipelineDeOlvido = ({ hashes, sessions }, modo = "ambos") => {
  const H = [...hashes];
  const S = [...sessions];
  const sin = (campo, lista) => ({
    $filter: { input: { $ifNull: [`$${campo}`, []] }, cond: { $not: [{ $in: ["$$this", lista] }] } },
  });
  const cerrado = { $eq: ["$closed", true] };
  const tamano = (set) => ({ $size: { $ifNull: [`$${set}`, []] } });
  const igual = (campo) => ({ $ifNull: [`$${campo}`, 0] });
  const contador = (campo, set, n) => {
    const descontado = { $max: [0, { $subtract: [igual(campo), n] }] };
    if (modo === "abiertos") return { $cond: [cerrado, igual(campo), tamano(set)] };
    if (modo === "cerrados") return { $cond: [cerrado, descontado, igual(campo)] };
    return { $cond: [cerrado, descontado, tamano(set)] };
  };
  const etapas = [];
  if (modo !== "cerrados") {
    etapas.push({
      $set: {
        visitors: sin("visitors", H),
        sessionHashes: sin("sessionHashes", S),
        loggedInVisitors: sin("loggedInVisitors", H),
      },
    });
  }
  etapas.push({
    $set: {
      visitorCount: contador("visitorCount", "visitors", H.length),
      sessions: contador("sessions", "sessionHashes", S.length),
      loggedIn: contador("loggedIn", "loggedInVisitors", H.length),
    },
  });
  return etapas;
};

/**
 * ── IDEMPOTENCIA ────────────────────────────────────────────────────────────
 * Se puede reintentar tras cualquier falla sin descontar dos veces. Por cada día, en este orden:
 *   1. sacar los hashes de los sets del día abierto (idempotente, ver `pipelineDeOlvido`);
 *   2. borrar los eventos de ESE día (los de la persona y los de su mismo hash);
 *   3. SÓLO si el borrado borró algo, descontar de los contadores del día cerrado.
 * Si falla el paso 2, nada se descontó y los eventos siguen: el reintento rehace el plan igual. Si falla
 * entre el 2 y el 3, el contador de ese día cerrado queda UNO de más (de más, nunca de menos, y sin
 * identidad detrás: es un número); el reintento no lo corrige porque ya no hay eventos, a propósito: es el
 * precio de no descontar dos veces. Que el cierre del día ocurra justo entre el 1 y el 3 tiene el mismo
 * costo, al revés (uno de menos). Los eventos con `userId` que sobren al final se barren.
 */
const olvidarUsuario = async (userId) => {
  const propios = await AnalyticsEvent.find({ userId }).select("day visitorHash").lean();
  if (propios.length === 0) return { days: 0 };

  const porDia = new Map();
  for (const e of propios) {
    if (!porDia.has(e.day)) porDia.set(e.day, new Set());
    porDia.get(e.day).add(e.visitorHash);
  }
  const clausulas = [...porDia.entries()].map(([day, hs]) => ({ day, visitorHash: { $in: [...hs] } }));

  const delosHashes = await AnalyticsEvent.find({ $or: clausulas })
    .select("day visitorHash sessionHash")
    .lean();
  const plan = planearOlvido(propios, delosHashes);

  for (const [day, p] of plan) {
    await AnalyticsDaily.updateOne({ day }, pipelineDeOlvido(p, "abiertos"), OPCIONES_PIPELINE);
    const borrado = await AnalyticsEvent.deleteMany({
      day,
      $or: [{ userId }, { visitorHash: { $in: [...p.hashes] } }],
    });
    if ((borrado?.deletedCount || 0) > 0) {
      await AnalyticsDaily.updateOne({ day }, pipelineDeOlvido(p, "cerrados"), OPCIONES_PIPELINE);
    }
  }
  await AnalyticsEvent.deleteMany({ userId });
  return { days: plan.size };
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

  // Los únicos del período nunca pueden ser menos que el mejor día de la serie. Pasa cuando los
  // eventos crudos se pierden o se purgan (baja de cuenta, TTL, tope del día) pero el contador del
  // día se conserva: se corrige hacia arriba en vez de mostrar "período 7, un día 9".
  const mejorDia = serie.reduce((m, d) => Math.max(m, d.visitors), 0);

  return {
    range: { days: rango.length, from: desde, to: hasta },
    totals: {
      views: sumar("views"),
      sessions: sumar("sessions"),
      visitors: Math.max(unicosDelPeriodo?.total || 0, mejorDia),
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
  armarIncrementos,
  TIPO_VALIDO,
  hostReferrer,
  TIPOS_CONOCIDOS,
  LIMITE_VISITANTES_DIA,
  LIMITE_SESIONES_DIA,
  RESERVA_LOGUEADOS_DIA,
  LIMITE_NUEVOS_POR_IP_DIA,
  superaTope,
  armarAddToSet,
  excedeTopeIp,
  esCuentaExcluida,
  condicionesDeExclusion,
  dominiosExcluidos,
  excluyeAdmins,
  planearOlvido,
  pipelineDeOlvido,
  olvidarUsuario,
  cerrarDiasAnteriores,
  OPCIONES_PIPELINE,
  _reiniciarCierre,
  _reiniciarTopesIp,
  MAX_CLAVES_TYPE,
  MAX_CLAVES_PATH,
  identificar,
  hoy,
  horaDe,
  DIAS_DE_EVENTOS,
  MAX_DIAS,
};


