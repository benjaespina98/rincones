const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

router.post("/login", authController.login);
router.post("/register", authController.register);
router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, authController.logout);

module.exports = router;
