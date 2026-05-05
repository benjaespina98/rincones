const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const User = require("../models/user.model");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("Falta JWT_SECRET en variables de entorno");
    error.statusCode = 500;
    throw error;
  }

  return secret;
};

const getAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredSameSite = String(process.env.COOKIE_SAMESITE || "").trim().toLowerCase();
  const sameSite = ["strict", "lax", "none"].includes(configuredSameSite)
    ? configuredSameSite
    : isProduction
      ? "none"
      : "lax";

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction || sameSite === "none",
    sameSite,
    path: "/",
  };

  const cookieDomain = String(process.env.COOKIE_DOMAIN || "").trim();
  if (cookieDomain) {
    cookieOptions.domain = cookieDomain;
  }

  return cookieOptions;
};

// Validar fortaleza de contraseña
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (password.length < minLength) {
    return {
      valid: false,
      message: `La contraseña debe tener mínimo ${minLength} caracteres`,
    };
  }

  if (!hasUpperCase || !hasLowerCase || !hasNumber) {
    return {
      valid: false,
      message: "La contraseña debe contener mayúsculas, minúsculas y números",
    };
  }

  return { valid: true };
};

// Guardar token en httpOnly cookie
const setAuthCookie = (res, token) => {
  res.cookie("authToken", token, {
    ...getAuthCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  });
};

const buildAuthResponse = (user, token) => ({
  data: {
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
    },
    token,
  },
});

const login = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ message: "Email y contrasena son obligatorios" });
    }

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const token = jwt.sign(
      {
        sub: String(user._id),
        role: user.role,
        email: user.email,
      },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    // Guardar token en httpOnly cookie
    setAuthCookie(res, token);

    return res.status(200).json({
      ...buildAuthResponse(user, token),
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    return res.status(200).json({
      data: {
        id: String(user._id),
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();
    const firstName = String(req.body.firstName || "").trim();

    if (!email || !password || !firstName) {
      return res.status(400).json({
        message: "Email, contraseña y nombre son obligatorios",
      });
    }

    // Validar fortaleza de contraseña
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        message: passwordValidation.message,
      });
    }

    // Validar nombre
    if (firstName.length < 2) {
      return res.status(400).json({
        message: "El nombre debe tener al menos 2 caracteres",
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Email inválido",
      });
    }

    // Verificar que el email no exista
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    // Hashear contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create({
      email,
      passwordHash,
      firstName,
      role: "user",
    });

    // Generar token
    const token = jwt.sign(
      {
        sub: String(user._id),
        role: user.role,
        email: user.email,
      },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    // Guardar token en httpOnly cookie
    setAuthCookie(res, token);

    return res.status(201).json({
      ...buildAuthResponse(user, token),
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    // Limpiar cookie
    res.clearCookie("authToken", getAuthCookieOptions());

    return res.status(200).json({
      message: "Sesión cerrada",
    });
  } catch (error) {
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email es obligatorio" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // No revelar que el email no existe
      return res.status(200).json({ message: "Si el email existe, recibirás instrucciones para restablecer la contraseña" });
    }

    // Generar token y guardarlo hashed
    const token = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    user.passwordResetToken = hashed;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hora
    await user.save();

    const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendURL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    // Intentar enviar email si hay config SMTP
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM || `no-reply@${process.env.FRONTEND_URL?.replace(/^https?:\/\//, '') || 'example.com'}`;

    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      // Intentar usar plantilla HTML si existe
      let htmlContent = null;
      try {
        const templatePath = path.resolve(__dirname, "../emails/passwordReset.html");
        const raw = await fs.promises.readFile(templatePath, "utf8");
        htmlContent = raw.replace(/{{RESET_URL}}/g, resetUrl);
      } catch (err) {
        // Si falla lectura de plantilla, usar HTML simple
        htmlContent = `<p>Para restablecer tu contraseña, haz click <a href="${resetUrl}">aquí</a>.</p><p>Si no solicitaste esto, ignora este email.</p>`;
      }

      const mailOptions = {
        from: emailFrom,
        to: email,
        subject: "Restablece tu contraseña - Rincones",
        text: `Para restablecer tu contraseña, visita: ${resetUrl}\n\nSi no solicitaste esto, ignora este email.`,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);

      return res.status(200).json({ message: "Instrucciones enviadas al email si existe en nuestro sistema" });
    }

    // Fallback: sin SMTP configurado, registrar la URL en logs
    console.info("Password reset URL:", resetUrl);

    // En desarrollo, devolver la URL para facilitar pruebas locales
    if (process.env.NODE_ENV !== "production") {
      return res.status(200).json({ message: "Instrucciones registradas (dev)", resetUrl });
    }

    return res.status(200).json({ message: "Instrucciones (URL) han sido registradas en el servidor (sin SMTP configurado)" });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: "Token, email y nueva contraseña son obligatorios" });
    }

    // Validar fuerza de contraseña
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({ email, passwordResetToken: hashedToken }).select("+passwordResetToken +passwordResetExpires +passwordHash");

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
      return res.status(400).json({ message: "Token inválido o expirado" });
    }

    // Actualizar contraseña
    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Generar token JWT y logear al usuario
    const jwtToken = jwt.sign(
      { sub: String(user._id), role: user.role, email: user.email },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    setAuthCookie(res, jwtToken);

    return res.status(200).json({ ...buildAuthResponse(user, jwtToken) });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  register,
  me,
  logout,
  forgotPassword,
  resetPassword,
};
