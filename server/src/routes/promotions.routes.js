const { Router } = require("express");
const promotionsController = require("../controllers/promotions.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

// Público: lo que ve cualquiera que abra Descubrí, con o sin sesión.
router.get("/", promotionsController.listPublic);
router.post("/:id/impression", promotionsController.impression);
router.post("/:id/click", promotionsController.click);

// Panel: cargar, programar, apagar. Sólo admin.
router.get("/all", authenticate, requireAdmin, promotionsController.listAll);
router.post("/", authenticate, requireAdmin, promotionsController.create);
router.put("/:id", authenticate, requireAdmin, promotionsController.update);
router.delete("/:id", authenticate, requireAdmin, promotionsController.remove);

module.exports = router;
