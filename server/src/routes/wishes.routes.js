const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const wishesController = require("../controllers/wishes.controller");

router.get("/", authenticate, wishesController.list);
router.post("/", authenticate, wishesController.create);
router.delete("/:id", authenticate, wishesController.remove);
router.patch("/:id/convert", authenticate, wishesController.convert);

module.exports = router;
