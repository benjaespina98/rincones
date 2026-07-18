const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const winesController = require("../controllers/wines.controller");

router.get("/", authenticate, winesController.list);
router.get("/search", authenticate, winesController.search);
router.get("/stats/summary", authenticate, winesController.statsSummary);
router.get("/stats/spending", authenticate, winesController.spendingStats);
router.post("/suggest", authenticate, winesController.suggest);
router.get("/cellar-ready", authenticate, winesController.cellarReady);
router.get("/:id", authenticate, winesController.getOne);
router.post("/", authenticate, winesController.create);
router.put("/:id", authenticate, winesController.update);
router.patch("/:id/stock", authenticate, winesController.adjustStock);
router.get("/:id/moments", authenticate, winesController.getMoments);
router.post("/:id/moments", authenticate, winesController.addMoment);
router.delete("/:id", authenticate, winesController.remove);

module.exports = router;
