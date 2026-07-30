const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const analyticsController = require("../controllers/analytics.controller");
const { authenticate, optionalAuth, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

/**
 * Límite propio para la ingesta.
 *
 * El general de la app (600 cada 15 minutos) lo comparten todas las rutas, y
 * medir no puede comerse la cuota de las cosas que el usuario necesita. Al mismo
 * tiempo tiene que ser generoso: detrás de un NAT o de una red de oficina hay
 * mucha gente con la misma IP, y cortarles el conteo sesgaría justo el número que
 * se quiere mirar.
 *
 * `skip` con éxito no aplica: acá todo responde 204, así que no habría límite.
 */
const ingestaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Pasado el límite se descarta en silencio: un 429 en la consola del visitante
  // por un evento de métrica es ruido sobre algo que no le importa.
  handler: (req, res) => res.status(204).end(),
});

// Público. `optionalAuth` sólo sirve para saber si hay sesión abierta (y poder
// distinguir usuarios de visitantes); sin token la petición sigue igual.
router.post("/collect", ingestaLimiter, optionalAuth, analyticsController.collect);

// El tablero es sólo para vos.
router.get("/summary", authenticate, requireAdmin, analyticsController.summary);

module.exports = router;
