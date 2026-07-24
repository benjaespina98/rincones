const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const mailService = require("../services/mail.service");
const { validateBirthDate } = require("../utils/age");

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

    return res.status(201).json(buildAuthResponse(user, token));
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

    // Generar token JWT y logear al usuario
    const jwtToken = jwt.sign(
      { sub: String(user._id), role: user.role, email: user.email },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    setAuthCookie(res, jwtToken);

    return res.status(200).json(buildAuthResponse(user, jwtToken));
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
