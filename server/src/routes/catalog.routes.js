const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const catalogController = require("../controllers/catalog.controller");

const router = Router();

// GET /api/catalog/search?q=... - vinos conocidos, catálogo argentino primero.
router.get("/search", authenticate, catalogController.search);

module.exports = router;
