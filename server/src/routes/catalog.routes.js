const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter } = require("../middleware/aiLimiter");
const catalogController = require("../controllers/catalog.controller");

const router = Router();

// GET /api/catalog/search?q=... - vinos conocidos, catálogo argentino primero.
router.get("/search", authenticate, aiLimiter, catalogController.search);

// POST /api/catalog/describe - ficha del vino (descripción, aromas, maridaje).
router.post("/describe", authenticate, aiLimiter, catalogController.describe);

// POST /api/catalog/recipe - plato con receta para acompañar la botella.
router.post("/recipe", authenticate, aiLimiter, catalogController.recipe);

// POST /api/catalog/pairing - qué maridaje le corresponde a un plato escrito a mano.
router.post("/pairing", authenticate, aiLimiter, catalogController.pairing);

// GET /api/catalog/featured - vinos destacados para la home Descubrí.
router.get("/featured", authenticate, catalogController.featured);

// GET /api/catalog/price - precio comunitario (promedio de lo que pagó la gente).
router.get("/price", authenticate, catalogController.price);

// POST /api/catalog/match - completa datos de un escaneo desde el catálogo.
router.post("/match", authenticate, aiLimiter, catalogController.match);

// Reseñas públicas de vinos (comunidad).
router.get("/reviews", authenticate, catalogController.reviews);
router.post("/reviews", authenticate, catalogController.publishReview);
router.delete("/reviews", authenticate, catalogController.removeReview);

module.exports = router;
