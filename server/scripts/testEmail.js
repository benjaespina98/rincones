const dotenv = require("dotenv");
const mailService = require("../src/services/mail.service");

dotenv.config();

/**
 * Verifica la configuración SMTP y, si se pasa un email, envía una prueba.
 * Uso:
 *   npm run mail:test               → solo verifica conexión/credenciales
 *   npm run mail:test tu@email.com  → además envía un email de prueba
 */
const run = async () => {
  const to = process.argv[2];

  console.log("→ Verificando configuración SMTP...");

  if (!mailService.isMailConfigured()) {
    console.error(
      "✗ Configuración incompleta. Definí en server/.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (y EMAIL_FROM)."
    );
    process.exit(1);
  }

  try {
    await mailService.verifyMailTransport();
    console.log("✓ Conexión SMTP correcta (host y credenciales válidos).");
  } catch (error) {
    console.error("✗ Falló la verificación SMTP:", error.message);
    process.exit(1);
  }

  if (!to) {
    console.log("\nTip: pasá un email para enviar una prueba real:");
    console.log("     npm run mail:test tu@email.com");
    process.exit(0);
  }

  const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
  const resetUrl = `${frontendURL}/reset-password?token=PRUEBA&email=${encodeURIComponent(to)}`;

  try {
    await mailService.sendPasswordResetEmail({ to, resetUrl });
    console.log(`✓ Email de prueba enviado a ${to}. Revisá la bandeja (y spam).`);
    process.exit(0);
  } catch (error) {
    console.error("✗ Falló el envío:", error.message);
    process.exit(1);
  }
};

run();
