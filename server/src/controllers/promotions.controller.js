const promotionsService = require("../services/promotions.service");
const { identificar } = require("../services/analytics.service");

/**
 * GET /api/promotions — lo que ve el visitante. Público.
 *
 * Manda `ETag` y `Cache-Control: no-cache`. La combinación suena contradictoria y
 * es exactamente lo que se busca: el navegador SIEMPRE pregunta (así prender o
 * apagar una campaña se ve al instante) pero si nada cambió la respuesta es un 304
 * vacío en vez de la lista entera. En la pantalla de entrada de la app, con
 * visitantes que vuelven varias veces por día, es la diferencia entre servir datos
 * y servir nada.
 */
const listPublic = async (req, res, next) => {
  try {
    const data = await promotionsService.listPublic();
    const etag = promotionsService.firmaPublica(data);

    res.set("Cache-Control", "no-cache");
    res.set("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

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
    const entries = Array.isArray(req.body?.events) ? req.body.events : [];
    const { visitorHash } = identificar(req);
    await promotionsService.recordEvents({ entries, visitorHash });
  } catch {
    // Un contador no puede romperle la navegación a nadie.
  }
  return res.status(204).end();
};

// ── Panel admin ────────────────────────────────────────────────────────────

const listAll = async (req, res, next) => {
  try {
    const data = await promotionsService.listAll({
      page: req.query.page,
      limit: req.query.limit,
      state: req.query.state,
      q: req.query.q,
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
};

const stats = async (req, res, next) => {
  try {
    const data = await promotionsService.stats(req.params.id, { days: req.query.days });
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

module.exports = {
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
