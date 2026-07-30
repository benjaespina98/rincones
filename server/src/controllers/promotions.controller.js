const promotionsService = require("../services/promotions.service");

/** GET /api/promotions — lo que ve el visitante. Público. */
const listPublic = async (req, res, next) => {
  try {
    const data = await promotionsService.listPublic();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/promotions/:id/impression y /click — contadores.
 *
 * Públicos y con respuesta 204 vacía, por lo mismo que la ingesta de analytics:
 * el cliente no necesita saber nada y así el clic puede irse con `sendBeacon`
 * mientras el navegador ya está yendo al sitio del anunciante.
 */
const countEvent = (tipo) => async (req, res) => {
  try {
    await promotionsService.countEvent(req.params.id, tipo);
  } catch {
    // Un contador no puede romperle la navegación a nadie.
  }
  return res.status(204).end();
};

// ── Panel admin ────────────────────────────────────────────────────────────

const listAll = async (req, res, next) => {
  try {
    const data = await promotionsService.listAll();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const promo = await promotionsService.create(req.user.id, req.body);
    return res.status(201).json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const promo = await promotionsService.update(req.params.id, req.body);
    if (!promo) return res.status(404).json({ success: false, error: "Destacado no encontrado" });
    return res.status(200).json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const ok = await promotionsService.remove(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Destacado no encontrado" });
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPublic,
  impression: countEvent("impression"),
  click: countEvent("click"),
  listAll,
  create,
  update,
  remove,
};
