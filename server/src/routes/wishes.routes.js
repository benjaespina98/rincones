const express = require("express");
const router = express.Router();
const { authenticate, requireCuentaCompleta } = require("../middleware/auth.middleware");
const wishesController = require("../controllers/wishes.controller");

router.get("/", authenticate, requireCuentaCompleta, wishesController.list);
router.post("/", authenticate, requireCuentaCompleta, wishesController.create);
router.patch("/:id", authenticate, requireCuentaCompleta, wishesController.update);
router.delete("/:id", authenticate, requireCuentaCompleta, wishesController.remove);

module.exports = router;
