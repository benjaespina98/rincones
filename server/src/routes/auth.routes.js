const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

router.post("/login", authController.login);
router.post("/register", authController.register);
// Público: es la forma de entrar, no hay sesión previa. El credential de
// Google es lo que se valida del lado del server, ver el controlador.
router.post("/google", authController.googleAuth);
router.get("/me", authenticate, authController.me);
// Público a propósito: se usa cuando el token de acceso YA venció. La
// credencial es la cookie httpOnly del refresh, no el header.
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
// Público: se abre desde el link del mail, sin sesión iniciada en ese navegador.
router.post("/verify-email", authController.verifyEmail);
// Autenticado: ya sabemos quién es por la sesión, no hace falta pedir el email.
router.post("/resend-verification", authenticate, authController.resendVerification);

module.exports = router;
