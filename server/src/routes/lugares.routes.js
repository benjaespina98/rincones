const { Router } = require("express");
const lugaresController = require("../controllers/lugares.controller");

const router = Router();

router.get("/", lugaresController.getAllLugares);
router.get("/:id", lugaresController.getLugarById);
router.post("/", lugaresController.createLugar);
router.put("/:id", lugaresController.updateLugarById);
router.delete("/:id", lugaresController.deleteLugarById);

module.exports = router;
