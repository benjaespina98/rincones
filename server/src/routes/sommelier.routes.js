const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter, sommelierDailyLimiter } = require("../middleware/aiLimiter");
const sommelierController = require("../controllers/sommelier.controller");
const historyController = require("../controllers/sommelierHistory.controller");

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

/**
 * El historial de charlas.
 *
 * Sin los limitadores de IA: leer o borrar una conversación guardada no llama a
 * ningún modelo. Ponerle el límite diario de 40 haría que mirar el archivo
 * gastara las preguntas del día, que es exactamente al revés de lo que el
 * historial existe para hacer.
 *
 * `authenticate` sí, y además cada consulta del controlador filtra por
 * `userId`: ver el comentario de arriba de sommelierHistory.controller.js sobre
 * por qué no alcanza con buscar por id.
 */
router.get("/conversations", authenticate, historyController.list);
router.get("/conversations/:id", authenticate, historyController.getOne);
router.delete("/conversations/:id", authenticate, historyController.remove);
// El pulgar sobre una respuesta (se apunta al mensaje por id; ver el controlador).
router.patch("/conversations/:id/feedback", authenticate, historyController.feedback);
// Sin id: todo el historial de quien pide. Se declara aparte de `/:id` a propósito,
// con otro nombre de handler, para que nunca se confunda con borrar una.
router.delete("/conversations", authenticate, historyController.removeAll);

module.exports = router;
