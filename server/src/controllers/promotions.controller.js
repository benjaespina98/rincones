const promotionsService = require("../services/promotions.service");
const { identificar } = require("../services/analytics.service");
const { peticionHumana } = require("../utils/trafficFilter");

/**
 * GET /api/promotions — lo que ve el visitante. Público.
 *
 * ── POR QUÉ NO LLEVA ETag ───────────────────────────────────────────────────
 * Lo tenía, para que el visitante que vuelve recibiera un 304 vacío en vez de la
 * lista entera. Se sacó porque el ahorro es despreciable —la respuesta son un par
 * de KB, seis tarjetas como mucho— y el riesgo no: si el navegador o un proxy
 * intermedio contestan el 304 sin tener el cuerpo guardado, el cliente se queda con
 * una lista vacía. Y una lista vacía acá no se ve como un error: se ve EXACTAMENTE
 * igual que "no hay campañas cargadas", porque la sección desaparece entera por
 * diseño. O sea, la falla más difícil de detectar posible, en la pantalla de
 * entrada de la app y sobre el contenido por el que alguien paga.
 *
 * `no-store` y no `no-cache`: que nadie guarde nada es lo que hace que prender o
 * apagar una campaña se refleje al instante. Lo que protege la base es la caché de
 * proceso del servicio, que es donde corresponde.
 */
const listPublic = async (req, res, next) => {
  try {
    const data = await promotionsService.listPublic();
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/promotions/events — impresiones y clics, en lote.
 *
 * Público y con 204 vacío, por lo mismo que la ingesta de métricas: el cliente no
 * necesita saber nada, y así el lote puede irse con `sendBeacon` mientras el
 * navegador ya está yendo al sitio del anunciante. Una petición normal en ese
 * momento se cancela a mitad de camino y se perdería justo el clic, que es el
 * número que el anunciante va a pedir.
 *
 * Acepta un lote porque un carrusel de seis tarjetas generaba seis peticiones por
 * visita para contar cosas. `identificar` reusa el hash anónimo de las métricas de
 * uso —sin cookies, sin IP guardada— y es lo que permite separar "veces mostrada"
 * de "personas distintas".
 */
const collect = async (req, res) => {
  try {
    // Los bots no ven publicidad. Es la primera objeción de cualquiera que pague
    // por impresiones, y contestarla con "no lo sé" termina la conversación. Se
    // descarta antes de tocar la base: el evento de un rastreador no existe.
    if (!peticionHumana(req)) return res.status(204).end();

    // Y tampoco cuenta el tráfico de los administradores. Sos vos probando tu
    // propia campaña: se vio con 26 clics sobre 20 impresiones, todos tuyos. Un
    // número que incluye al que factura no lo puede defender nadie, y de paso
    // esto vuelve el conteo conservador, que es como tiene que estar sesgado un
    // número que se cobra.
    if (req.user?.role === "admin") return res.status(204).end();

    const entries = Array.isArray(req.body?.events) ? req.body.events : [];
    const { visitorHash } = identificar(req);
    await promotionsService.recordEvents({ entries, visitorHash });
  } catch {
    // Un contador no puede romperle la navegación a nadie.
  }
  return res.status(204).end();
};

/**
 * El informe que abre el anunciante con su enlace. Público a propósito: la llave
 * ES el enlace. Ver `ensureReportToken` en el servicio.
 */
const publicReport = async (req, res, next) => {
  try {
    const informe = await promotionsService.reportByToken(req.params.token, {
      days: Number(req.query.days) || 30,
      from: req.query.from,
      to: req.query.to,
    });
    if (!informe) return res.status(404).json({ success: false, error: "Informe no disponible" });
    // Sin caché: un anunciante que recarga tiene que ver el número de ahora, no
    // uno de hace media hora que ya no coincide con lo que le dijiste.
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: informe });
  } catch (error) {
    return next(error);
  }
};

// ── Panel admin ────────────────────────────────────────────────────────────

const listAll = async (req, res, next) => {
  try {
    const data = await promotionsService.listAll({
      page: req.query.page,
      limit: req.query.limit,
      state: req.query.state,
      q: req.query.q,
      kind: req.query.kind,
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
};

const stats = async (req, res, next) => {
  try {
    const data = await promotionsService.stats(req.params.id, {
      days: req.query.days,
      from: req.query.from,
      to: req.query.to,
    });
    if (!data) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const promo = await promotionsService.create(req.user, req.body);
    return res.status(201).json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const promo = await promotionsService.update(req.params.id, req.user, req.body);
    if (!promo) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.status(200).json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
};

/** PATCH /:id/visibility — el interruptor de mostrar/ocultar. */
const setVisibility = async (req, res, next) => {
  try {
    const promo = await promotionsService.setVisibility(
      req.params.id,
      req.body?.visible === true || req.body?.visible === "true",
      req.user
    );
    if (!promo) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.status(200).json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
};

/** PATCH /:id/move — subir o bajar un lugar en el carrusel. */
const move = async (req, res, next) => {
  try {
    const direccion = req.body?.direction === "down" ? "down" : "up";
    const resultado = await promotionsService.move(req.params.id, direccion, req.user);
    if (!resultado) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const ok = await promotionsService.remove(req.params.id, req.user);
    if (!ok) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
};

/** Genera (o devuelve) el enlace del informe de una campaña. Sólo admin. */
const reportLink = async (req, res, next) => {
  try {
    const token = await promotionsService.ensureReportToken(req.params.id);
    if (!token) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.json({ success: true, data: { token } });
  } catch (error) {
    return next(error);
  }
};

/** Corta el enlace. Los números no se tocan: sólo deja de poder verlos. */
const revokeReportLink = async (req, res, next) => {
  try {
    const ok = await promotionsService.revokeReportToken(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  publicReport,
  reportLink,
  revokeReportLink,
  listPublic,
  collect,
  listAll,
  stats,
  create,
  update,
  setVisibility,
  move,
  remove,
};
