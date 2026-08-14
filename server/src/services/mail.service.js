const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

let cachedTransporter = null;

const getMailConfig = () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from =
    String(process.env.EMAIL_FROM || "").trim() ||
    (user ? `Rincones <${user}>` : "");
  return { host, port, user, pass, from };
};

/** ¿Están todas las variables SMTP necesarias? */
const isMailConfigured = () => {
  const { host, port, user, pass } = getMailConfig();
  return Boolean(host && port && user && pass);
};

/** Devuelve un transporter de nodemailer, o null si falta configuración. */
const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  const { host, port, user, pass } = getMailConfig();
  if (!host || !port || !user || !pass) return null;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    // 465 usa SSL directo; 587/25 usan STARTTLS.
    secure: port === 465,
    auth: { user, pass },
  });

  return cachedTransporter;
};

/** Verifica la conexión/credenciales SMTP (para el script de prueba). */
const verifyMailTransport = async () => {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP no configurado: faltan SMTP_HOST, SMTP_PORT, SMTP_USER o SMTP_PASS");
  }
  await transporter.verify();
  return true;
};

const loadResetTemplate = async (resetUrl) => {
  try {
    const templatePath = path.resolve(__dirname, "../emails/passwordReset.html");
    const raw = await fs.promises.readFile(templatePath, "utf8");
    return raw.replace(/{{RESET_URL}}/g, resetUrl);
  } catch {
    return `<p>Para restablecer tu contraseña, hacé clic <a href="${resetUrl}">aquí</a>. El enlace expira en 1 hora.</p>`;
  }
};

const loadVerifyTemplate = async (verifyUrl) => {
  try {
    const templatePath = path.resolve(__dirname, "../emails/verifyEmail.html");
    const raw = await fs.promises.readFile(templatePath, "utf8");
    return raw.replace(/{{VERIFY_URL}}/g, verifyUrl);
  } catch {
    return `<p>Para confirmar tu email, hacé clic <a href="${verifyUrl}">aquí</a>. El enlace expira en 24 horas.</p>`;
  }
};

/** Envía el email de recuperación de contraseña. Lanza si el envío falla. */
const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP no configurado");
  }

  const { from } = getMailConfig();
  const html = await loadResetTemplate(resetUrl);

  await transporter.sendMail({
    from,
    to,
    subject: "Restablecé tu contraseña · Rincones",
    text:
      `Recibimos un pedido para restablecer tu contraseña en Rincones.\n\n` +
      `Abrí este enlace para continuar (expira en 1 hora):\n${resetUrl}\n\n` +
      `Si no lo solicitaste, podés ignorar este correo.`,
    html,
  });
};

/** Envía el email de verificación de cuenta. Lanza si el envío falla. */
const sendVerificationEmail = async ({ to, verifyUrl }) => {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP no configurado");
  }

  const { from } = getMailConfig();
  const html = await loadVerifyTemplate(verifyUrl);

  await transporter.sendMail({
    from,
    to,
    subject: "Confirmá tu email · Rincones",
    text:
      `Ya casi. Confirmá que esta cuenta de Rincones es tuya.\n\n` +
      `Abrí este enlace para continuar (expira en 24 horas):\n${verifyUrl}\n\n` +
      `Si no creaste esta cuenta, podés ignorar este correo.`,
    html,
  });
};

module.exports = {
  isMailConfigured,
  getTransporter,
  verifyMailTransport,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
