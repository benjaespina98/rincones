const { Router } = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");

const router = Router();

router.get("/logs", authenticate, requireAdmin, adminController.getChangeLogs);

// Usuarios y roles
router.get("/users", authenticate, requireAdmin, adminController.getUsers);
router.put("/users/:userId/role", authenticate, requireAdmin, adminController.updateUserRole);
router.delete("/users/:userId", authenticate, requireAdmin, adminController.deleteUser);

// Moderación de reseñas (lo único público que escriben los usuarios)
router.get("/reviews", authenticate, requireAdmin, adminController.getReviews);
router.delete("/reviews/:reviewId", authenticate, requireAdmin, adminController.deleteReview);

module.exports = router;
