const { Router } = require("express");
const { authenticate, requireCuentaCompleta } = require("../middleware/auth.middleware");
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
  authenticate, requireCuentaCompleta,
  sommelierDailyLimiter,
  aiLimiter,
  sommelierController.ask
);

/**
 * POST /api/sommelier/ask-stream — la misma pregunta con la respuesta escribiéndose (SSE).
 * Mismos límites, mismo orden: una consulta en vivo cuenta como una consulta.
 */
router.post(
  "/ask-stream",
  authenticate, requireCuentaCompleta,
  sommelierDailyLimiter,
  aiLimiter,
  sommelierController.askStream
);

/**
 * POST /api/sommelier/photo — YA NO SE ACEPTAN FOTOS.
 *
 * Cada imagen se cobraba como una consulta de visión y se comía los tokens. El Sommelier sólo recibe texto. La ruta
 * queda para contestar claro (410) a quien tenga una versión vieja de la app abierta, sin leer el archivo ni llamar al modelo.
 */
router.post("/photo", authenticate, (req, res) =>
  res.status(410).json({ message: "El Sommelier ya no mira fotos. Contale en palabras qué vas a comer o qué querés tomar." })
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
router.get("/conversations", authenticate, requireCuentaCompleta, historyController.list);
router.get("/conversations/:id", authenticate, requireCuentaCompleta, historyController.getOne);
router.delete("/conversations/:id", authenticate, requireCuentaCompleta, historyController.remove);
// El pulgar sobre una respuesta (se apunta al mensaje por id; ver el controlador).
router.patch("/conversations/:id/feedback", authenticate, requireCuentaCompleta, historyController.feedback);
// Sin id: todo el historial de quien pide. Se declara aparte de `/:id` a propósito,
// con otro nombre de handler, para que nunca se confunda con borrar una.
router.delete("/conversations", authenticate, requireCuentaCompleta, historyController.removeAll);

module.exports = router;
