const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter, sommelierDailyLimiter } = require("../middleware/aiLimiter");
const sommelierController = require("../controllers/sommelier.controller");

const router = Router();

/**
 * POST /api/sommelier/ask — la guía de vino.
 *
 * DOS límites y no uno, porque frenan cosas distintas:
 *
 *   aiLimiter (60/hora)              un bucle roto o una pestaña reintentando.
 *   sommelierDailyLimiter (40/día)   el uso intenso y legítimo, que conversar
 *                                    invita a tener y escanear no.
 *
 * Los dos van DESPUÉS de `authenticate`: cuentan por usuario, y antes de
 * autenticar `req.user` no existe todavía y caerían al fallback por IP —que
 * detrás de un NAT castiga a un edificio entero por lo que hizo uno.
 *
 * El orden entre ellos importa poco, pero el diario va primero para que quien
 * ya gastó el día lo sepa por el mensaje correcto.
 */
router.post(
  "/ask",
  authenticate,
  sommelierDailyLimiter,
  aiLimiter,
  sommelierController.ask
);

module.exports = router;
