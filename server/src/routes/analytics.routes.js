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
 * tiempo tiene que dejar pasar el uso real: el client junta los eventos y manda
 * un lote cada 4 s como máximo (~75 pedidos por 5 min en el peor caso continuo; una
 * sesión normal manda bastante menos), y detrás de un NAT hay varias personas con
 * la misma IP. Por eso 100 por 5 min (antes 300, que dejaba a un script sembrar
 * ~86 mil lotes por IP y por día). Se puede mover con ANALYTICS_LIMITE_IP.
 *
 * `skip` con éxito no aplica: acá todo responde 204, así que no habría límite.
 */
const limiteIp = () => {
  const n = Math.floor(Number(process.env.ANALYTICS_LIMITE_IP));
  return Number.isFinite(n) && n > 0 ? n : 100;
};

const ingestaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: limiteIp, // v6: acepta número o función (se evalúa por pedido)
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
