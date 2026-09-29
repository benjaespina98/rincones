const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter, aiDailyLimiter } = require("../middleware/aiLimiter");
const catalogController = require("../controllers/catalog.controller");

const router = Router();

// GET /api/catalog/search?q=... - vinos conocidos, catálogo argentino primero.
router.get("/search", authenticate, aiLimiter, aiDailyLimiter, catalogController.search);

// POST /api/catalog/describe - ficha del vino (descripción, aromas, maridaje).
router.post("/describe", authenticate, aiLimiter, aiDailyLimiter, catalogController.describe);

// POST /api/catalog/recipe - plato con receta para acompañar la botella.
router.post("/recipe", authenticate, aiLimiter, aiDailyLimiter, catalogController.recipe);

// POST /api/catalog/pairing - qué maridaje le corresponde a un plato escrito a mano.
router.post("/pairing", authenticate, aiLimiter, aiDailyLimiter, catalogController.pairing);

// GET /api/catalog/featured - vinos destacados para la home Descubrí.
router.get("/featured", authenticate, catalogController.featured);

// GET /api/catalog/price - precio comunitario (promedio de lo que pagó la gente).
router.get("/price", authenticate, catalogController.price);

// Acá vivía POST /api/catalog/match, que el navegador llamaba DESPUÉS de leer la
// etiqueta para completar los datos que faltaban. Se fue junto con la pregunta
// que resolvía: el cruce contra el catálogo ahora es parte de la lectura y pasa
// dentro de /api/labels/analyze, en el mismo viaje, porque ahí además se
// verifica el nombre (ver `conVerificacion` en labels.controller.js). Eran dos
// llamadas para la misma pregunta —¿qué botella es ésta?— y separarlas era lo
// que permitía que el nombre entrara sin que ninguna fuente lo respaldara.

// Reseñas públicas de vinos (comunidad).
// "/reviews/mine" va antes que "/reviews" por claridad; son rutas distintas y
// Express no las confunde, pero leerlas juntas evita duplicarlas por error.
router.get("/reviews/mine", authenticate, catalogController.myReviews);
router.get("/reviews", authenticate, catalogController.reviews);
router.post("/reviews", authenticate, catalogController.publishReview);
router.delete("/reviews", authenticate, catalogController.removeReview);

module.exports = router;
