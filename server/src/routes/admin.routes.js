const { Router } = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

router.get("/logs", authenticate, requireAdmin, adminController.getChangeLogs);

module.exports = router;
