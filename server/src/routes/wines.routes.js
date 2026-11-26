const express = require("express");
const router = express.Router();
const { authenticate, requireCuentaCompleta } = require("../middleware/auth.middleware");
const winesController = require("../controllers/wines.controller");

router.get("/", authenticate, requireCuentaCompleta, winesController.list);
router.get("/search", authenticate, requireCuentaCompleta, winesController.search);
router.get("/stats/summary", authenticate, requireCuentaCompleta, winesController.statsSummary);
router.get("/stats/spending", authenticate, requireCuentaCompleta, winesController.spendingStats);
router.post("/suggest", authenticate, requireCuentaCompleta, winesController.suggest);
router.get("/cellar-ready", authenticate, requireCuentaCompleta, winesController.cellarReady);
// Tu diario completo. Va ANTES de "/:id" por lo mismo que "bulk": si no,
// Express lee "moments" como el id de un vino y devuelve 404.
router.get("/moments", authenticate, requireCuentaCompleta, winesController.getAllMoments);
router.get("/:id", authenticate, requireCuentaCompleta, winesController.getOne);
router.post("/", authenticate, requireCuentaCompleta, winesController.create);
// Va antes de "/:id" a propósito: si no, Express lee "bulk" como un id.
router.post("/bulk", authenticate, requireCuentaCompleta, winesController.bulk);
router.put("/:id", authenticate, requireCuentaCompleta, winesController.update);
router.patch("/:id/stock", authenticate, requireCuentaCompleta, winesController.adjustStock);
router.get("/:id/moments", authenticate, requireCuentaCompleta, winesController.getMoments);
router.post("/:id/moments", authenticate, requireCuentaCompleta, winesController.addMoment);
router.delete("/:id", authenticate, requireCuentaCompleta, winesController.remove);

module.exports = router;
