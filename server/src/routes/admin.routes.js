const { Router } = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

router.get("/logs", authenticate, requireAdmin, adminController.getChangeLogs);
router.get("/users", authenticate, requireAdmin, adminController.getUsers);
router.put("/users/:userId/role", authenticate, requireAdmin, adminController.updateUserRole);

module.exports = router;
