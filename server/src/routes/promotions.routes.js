const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const promotionsController = require("../controllers/promotions.controller");
const { authenticate, optionalAuth, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

/**
 * Límite propio para el conteo de impresiones y clics.
 *
 * Dos razones para que no comparta el general de la app (600 cada 15 minutos):
 *  - Medir no puede comerle cuota a lo que el usuario necesita. Al revés tampoco:
 *    alguien usando mucho la app se quedaría sin poder reportar nada, y se
 *    sesgarían justo los datos de los visitantes más activos.
 *  - Es el freno contra el abuso de un endpoint público. No alcanza solo —el
 *    servicio además sólo cuenta campañas que están efectivamente al aire y
 *    deduplica por visitante—, pero es la primera barrera y la más barata.
 *
 * Pasado el límite se descarta en silencio con un 204: un 429 en la consola del
 * visitante por una métrica es ruido sobre algo que no le importa.
 */
const conteoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(204).end(),
});

// Público: lo que ve cualquiera que abra Descubrí, con o sin sesión.
router.get("/", promotionsController.listPublic);
// `optionalAuth` y no `authenticate`: el visitante puede no tener sesión y sus
// impresiones cuentan igual. Se lee el token, si viene, sólo para saber si quien
// mira es un administrador —el suyo no se cuenta, ver el controlador—.
router.post("/events", conteoLimiter, optionalAuth, promotionsController.collect);

// El informe del anunciante. Público porque la llave es el enlace: pedirle una
// cuenta a quien sólo quiere ver si su publicidad se está viendo termina en
// "mandame una captura", y una captura no la audita nadie.
router.get("/report/:token", promotionsController.publicReport);

// Panel: cargar, programar, pausar, reordenar, medir. Sólo admin.
router.get("/all", authenticate, requireAdmin, promotionsController.listAll);
router.post("/:id/report-link", authenticate, requireAdmin, promotionsController.reportLink);
router.delete("/:id/report-link", authenticate, requireAdmin, promotionsController.revokeReportLink);
router.get("/:id/stats", authenticate, requireAdmin, promotionsController.stats);
router.post("/", authenticate, requireAdmin, promotionsController.create);
router.put("/:id", authenticate, requireAdmin, promotionsController.update);
router.patch("/:id/visibility", authenticate, requireAdmin, promotionsController.setVisibility);
router.patch("/:id/move", authenticate, requireAdmin, promotionsController.move);
router.delete("/:id", authenticate, requireAdmin, promotionsController.remove);

module.exports = router;
