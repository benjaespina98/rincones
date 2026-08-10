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
//
// SIN `aiLimiter` a propósito: desde que `findMatch` mira sólo el catálogo curado
// y el comunitario, esto no toca Gemini ni sale a internet — es memoria y una
// consulta indexada. Contarlo contra la cuota de IA cobraba dos llamadas por
// escaneo (ésta y la de la etiqueta) sobre un presupuesto de 60 por hora, así que
// escanear una compra entera se quedaba sin margen a la mitad. El límite general
// de la app sigue aplicando.
router.post("/match", authenticate, catalogController.match);

// Reseñas públicas de vinos (comunidad).
// "/reviews/mine" va antes que "/reviews" por claridad; son rutas distintas y
// Express no las confunde, pero leerlas juntas evita duplicarlas por error.
router.get("/reviews/mine", authenticate, catalogController.myReviews);
router.get("/reviews", authenticate, catalogController.reviews);
router.post("/reviews", authenticate, catalogController.publishReview);
router.delete("/reviews", authenticate, catalogController.removeReview);

module.exports = router;
