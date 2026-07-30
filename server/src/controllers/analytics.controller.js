const analyticsService = require("../services/analytics.service");

/**
 * POST /api/analytics/collect — ingesta de eventos.
 *
 * Es PÚBLICO a propósito: los visitantes sin sesión son justamente los que hay
 * que poder contar, y exigir token haría que "cuánta gente entra" midiera sólo a
 * los que ya se registraron.
 *
 * Responde 204 y nada más. No devuelve datos porque no hay nada que el cliente
 * necesite saber, y así el navegador puede mandar el último evento con
 * `sendBeacon` mientras la pestaña se cierra.
 *
 * Nunca falla hacia el cliente: si medir se rompe, la app no se entera. Un 500
 * acá aparecería en la consola de cada visitante por algo que no le importa.
 */
const collect = async (req, res) => {
  try {
    const cuerpo = req.body || {};
    const eventos = Array.isArray(cuerpo.events) ? cuerpo.events : [cuerpo];
    await analyticsService.track(req, eventos);
  } catch {
    // Silencio deliberado: ver arriba.
  }
  return res.status(204).end();
};

/** GET /api/analytics/summary?days=30 — el tablero. Sólo admin. */
const summary = async (req, res, next) => {
  try {
    const data = await analyticsService.getSummary({ days: req.query.days });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { collect, summary };
