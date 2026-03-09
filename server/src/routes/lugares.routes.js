const { Router } = require("express");
const lugaresController = require("../controllers/lugares.controller");
const validateLugarPayload = require("../middleware/validateLugarPayload");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

router.get("/", lugaresController.getAllLugares);
router.get("/:id", lugaresController.getLugarById);
router.post("/", authenticate, requireAdmin, validateLugarPayload, lugaresController.createLugar);
router.put("/:id", authenticate, requireAdmin, validateLugarPayload, lugaresController.updateLugarById);
router.delete("/:id", authenticate, requireAdmin, lugaresController.deleteLugarById);

module.exports = router;
