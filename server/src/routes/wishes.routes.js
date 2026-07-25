const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const wishesController = require("../controllers/wishes.controller");

router.get("/", authenticate, wishesController.list);
router.post("/", authenticate, wishesController.create);
router.patch("/:id/convert", authenticate, wishesController.convert);
router.patch("/:id", authenticate, wishesController.update);
router.delete("/:id", authenticate, wishesController.remove);

module.exports = router;
