const { Router } = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const { aiLimiter } = require("../middleware/aiLimiter");

const router = Router();

router.get("/logs", authenticate, requireAdmin, adminController.getChangeLogs);
router.get("/logs/actors", authenticate, requireAdmin, adminController.getChangeLogActors);
// Antes de la ruta con :userId no aplica acá (no hay :param), pero va aparte
// de "/logs" (la auditoría) porque es una cosa distinta: ver el comentario
// grande en el controlador.
router.get("/error-logs", authenticate, requireAdmin, adminController.getErrorLogs);
// Los números del Resumen, contados por la base. Ver el comentario del controlador.
router.get("/summary", authenticate, requireAdmin, adminController.getSummary);

// Usuarios y roles
router.get("/users", authenticate, requireAdmin, adminController.getUsers);
router.put("/users/:userId/role", authenticate, requireAdmin, adminController.updateUserRole);
// Antes de la ruta con :userId, o Express la matchea a esta y "bulk" viaja
// como si fuera un userId.
router.delete("/users/bulk", authenticate, requireAdmin, adminController.bulkDeleteUsers);
router.delete("/users/:userId", authenticate, requireAdmin, adminController.deleteUser);

// Moderación de reseñas (lo único público que escriben los usuarios)
router.get("/reviews", authenticate, requireAdmin, adminController.getReviews);
router.delete("/reviews/:reviewId", authenticate, requireAdmin, adminController.deleteReview);

// Curación de fotos: precargar la foto pública de un vino sin pasar por
// tenerlo en la bodega propia. Ver el comentario en admin.controller.js.
// Sin aiLimiter: no toca Gemini, sólo el catálogo local + lo que ya cargaron
// los usuarios. Va antes que "/wine-images" a propósito, aunque Express no
// las confundiría (son rutas distintas) — leerlas juntas evita duplicarlas
// por error, mismo criterio que ya usa este archivo en Usuarios.
router.get("/wine-images/browse", authenticate, requireAdmin, adminController.browseWineImages);

// Con aiLimiter: la búsqueda cae en la misma cuota de Gemini que el buscador
// público (catalogService.searchWines la comparte), y esto es un panel de
// admin, no un uso masivo — no necesita un techo aparte.
router.get("/wine-images", authenticate, requireAdmin, aiLimiter, adminController.searchWineImages);
router.put("/wine-images", authenticate, requireAdmin, adminController.setWineImage);

module.exports = router;
