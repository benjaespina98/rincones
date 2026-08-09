const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const mailService = require("../services/mail.service");
const { validateBirthDate } = require("../utils/age");
const sessions = require("../services/session.service");
const { setAuthCookie, setRefreshCookie, clearAuthCookies, startSession } = sessions;
const { validatePasswordStrength } = require("../utils/password");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("Falta JWT_SECRET en variables de entorno");
    error.statusCode = 500;
    throw error;
  }

  return secret;
};

const buildAuthResponse = (user, token) => ({
  data: {
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
    },
    // El token también se devuelve en el body para que el cliente lo guarde y
    // lo mande por header Authorization (imprescindible en Safari/iOS, donde la
    // cookie cross-dominio se bloquea). La cookie httpOnly se mantiene como respaldo.
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
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = await startSession(res, user, req);

    return res.status(200).json(buildAuthResponse(user, token));
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
        onboarded: Boolean(user.onboardedAt),
        firstName: user.firstName || "",
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

    // Fecha de nacimiento obligatoria: valida mayoría de edad (18+).
    const birthValidation = validateBirthDate(req.body.birthDate);
    if (!birthValidation.valid) {
      return res.status(400).json({ message: birthValidation.message });
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
      birthDate: birthValidation.date,
      role: "user",
    });

    // Generar token
    const token = await startSession(res, user, req);

    return res.status(201).json(buildAuthResponse(user, token));
  } catch (error) {
    return next(error);
  }
};

/**
 * Canjea el refresh por un token de acceso nuevo.
 *
 * Es público a propósito: se llama JUSTAMENTE cuando el token de acceso ya
 * venció, así que exigir uno válido lo volvería inútil. La credencial es la
 * cookie httpOnly, que el navegador manda sola y ningún script puede leer.
 */
const refresh = async (req, res, next) => {
  try {
    const actual = req.cookies?.refreshToken;
    const rotado = await sessions.rotateRefreshToken(actual, req.get("user-agent"));

    if (!rotado) {
      // Sesión desconocida o vencida. Limpiamos las cookies para que el cliente
      // no siga reintentando con algo que no sirve.
      clearAuthCookies(res);
      return res.status(401).json({ message: "Sesión expirada" });
    }

    if (rotado.reused) {
      // Alguien usó un token que su dueño ya había cambiado. `rotateRefreshToken`
      // ya cerró todas las sesiones del usuario; acá sólo queda no darle nada a
      // quien lo presentó. No se distingue en el mensaje a propósito: si es un
      // atacante, no le decimos que lo detectamos.
      clearAuthCookies(res);
      return res.status(401).json({ message: "Sesión expirada" });
    }

    const user = await User.findById(rotado.userId);
    if (!user) {
      // La cuenta se borró con la sesión abierta.
      await sessions.revokeAllForUser(rotado.userId);
      clearAuthCookies(res);
      return res.status(401).json({ message: "Sesión expirada" });
    }

    const token = sessions.signAccessToken(user);
    setAuthCookie(res, token);
    setRefreshCookie(res, rotado.token, rotado.expiresAt);

    return res.status(200).json(buildAuthResponse(user, token));
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    // Cerrar sesión ahora la termina DE VERDAD: borra el refresh de la base, no
    // sólo la cookie de este navegador. Antes un token copiado seguía sirviendo
    // hasta que expiraba, una semana después.
    await sessions.revokeRefreshToken(req.cookies?.refreshToken);
    clearAuthCookies(res);

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

    const genericMessage =
      "Si el email existe, recibirás instrucciones para restablecer la contraseña";
    const isDev = process.env.NODE_ENV !== "production";

    // Si el SMTP está configurado, enviamos el email. Un fallo de envío no debe
    // devolver 500 ni revelar si el email existe: registramos y respondemos genérico.
    if (mailService.isMailConfigured()) {
      try {
        await mailService.sendPasswordResetEmail({ to: email, resetUrl });
        return res.status(200).json({ message: genericMessage });
      } catch (mailError) {
        console.error("Error enviando email de recuperación:", mailError.message);
        if (isDev) {
          return res
            .status(200)
            .json({ message: "No se pudo enviar el email (dev). Usá el enlace directo.", resetUrl });
        }
        return res.status(200).json({ message: genericMessage });
      }
    }

    // Sin SMTP configurado: registramos la URL. En desarrollo la devolvemos para probar.
    console.info("Password reset URL:", resetUrl);
    if (isDev) {
      return res.status(200).json({ message: "Instrucciones registradas (dev)", resetUrl });
    }
    return res.status(200).json({ message: genericMessage });
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

    // Restablecer la contraseña cierra TODAS las sesiones abiertas. Si alguien
    // más tenía acceso, este es justo el momento de echarlo: si no, seguiría
    // adentro con la contraseña vieja ya cambiada.
    await sessions.revokeAllForUser(user._id);

    const jwtToken = await startSession(res, user, req);

    return res.status(200).json(buildAuthResponse(user, jwtToken));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  register,
  refresh,
  me,
  logout,
  forgotPassword,
  resetPassword,
};
