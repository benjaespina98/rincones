const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
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

/**
 * ── POR QUÉ `onboarded` VA ACÁ Y NO SÓLO EN `/me` ───────────────────────────
 * Faltaba en esta respuesta, y ese hueco era la causa real de "a veces el
 * onboarding aparece recién después de un rato": tras registrarse, el cliente
 * arma `user` con ESTA respuesta (register → login inmediato), no con `/me`.
 * Sin `onboarded` acá, quedaba `undefined` — y `undefined === false` es
 * `false`, así que el gate de onboarding no disparaba. Recién se corregía solo
 * cuando la PWA se cerraba y volvía a abrir (`AuthProvider` monta de nuevo y
 * ahí sí llama a `/me`), momento en el que el onboarding aparecía "de la
 * nada" en medio del uso normal. Las cuatro respuestas de auth (login,
 * register, refresh, reset-password) tienen que decir lo mismo que `/me`.
 */
const buildAuthResponse = (user, token) => ({
  data: {
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
      onboarded: Boolean(user.onboardedAt),
      // Cuentas de Google entran sin haber pasado por el formulario que pide
      // fecha de nacimiento (validación de mayoría de edad). `AppGate` usa
      // esto para exigirla en una pantalla propia antes de dejar pasar, en
      // vez de asumir 18+ o inventar una fecha.
      hasBirthDate: Boolean(user.birthDate),
    },
    // El token también se devuelve en el body para que el cliente lo guarde y
    // lo mande por header Authorization (imprescindible en Safari/iOS, donde la
    // cookie cross-dominio se bloquea). La cookie httpOnly se mantiene como respaldo.
    token,
  },
});

// 24hs y no 1 hora (como el reset de contraseña): confirmar el email no es una
// acción urgente de seguridad, es un trámite que la persona puede dejar para
// más tarde — abrir el mail del celular al rato de registrarse desde la compu,
// por ejemplo. Un margen corto sólo generaría "reenviame el link" de más.
const EMAIL_VERIFICATION_HOURS = 24;

// Genera el par token/hash y lo dejar guardado en el usuario (sin persistir:
// quien llama decide cuándo hacer save()). El mismo criterio que forgotPassword:
// se guarda el hash, nunca el token — así ni un dump de la base sirve para
// armar un link de verificación válido.
const issueEmailVerificationToken = (user) => {
  const token = crypto.randomBytes(32).toString("hex");
  user.emailVerificationToken = crypto.createHash("sha256").update(token).digest("hex");
  user.emailVerificationExpires = Date.now() + EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000;
  return token;
};

// Envía el email de verificación. Best-effort: si SMTP no está configurado o
// falla, no aborta el registro — sólo lo dejamos escrito en el log (y, en dev,
// lo devolvemos) para poder probar el flujo sin bandeja de entrada real.
const sendVerificationEmail = async (user, token) => {
  const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
  const verifyUrl = `${frontendURL}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
  const isDev = process.env.NODE_ENV !== "production";

  if (mailService.isMailConfigured()) {
    try {
      await mailService.sendVerificationEmail({ to: user.email, verifyUrl });
      return { sent: true };
    } catch (mailError) {
      console.error("Error enviando email de verificación:", mailError.message);
      return { sent: false, verifyUrl: isDev ? verifyUrl : undefined };
    }
  }

  console.info("Verification email URL:", verifyUrl);
  return { sent: false, verifyUrl: isDev ? verifyUrl : undefined };
};

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
        emailVerified: Boolean(user.emailVerified),
        hasBirthDate: Boolean(user.birthDate),
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

    // Cuenta creada como no verificada (emailVerified: false por default). El
    // envío es best-effort y no bloquea el registro: si el mail falla, la
    // persona igual entra y puede pedir un reenvío desde el aviso en la app.
    const verificationToken = issueEmailVerificationToken(user);
    await user.save();
    // Nunca lanza (ver la función): un SMTP caído no puede tirar abajo un
    // registro que, por lo demás, ya está completo. Pero el resultado SÍ se
    // devuelve (antes se descartaba acá, a diferencia de resendVerification):
    // si el envío falló, el cliente lo tiene que saber para avisar en vez de
    // dejar a la persona esperando un mail que nunca salió.
    const mailResult = await sendVerificationEmail(user, verificationToken);

    // Generar token
    const token = await startSession(res, user, req);

    return res.status(201).json({
      ...buildAuthResponse(user, token),
      mail: { sent: mailResult.sent, verifyUrl: mailResult.verifyUrl },
    });
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

/**
 * Confirma el email a partir del link que se manda al registrarse (o al
 * reenviar). Mismo criterio que resetPassword: el token se recibe en claro,
 * se hashea acá y se compara contra el hash guardado — nunca al revés.
 *
 * Es de un solo uso porque limpiamos `emailVerificationToken` apenas se usa:
 * un segundo click con el mismo link ya no encuentra ningún usuario con ESE
 * hash, así que cae en "inválido o expirado" en vez de volver a verificar.
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({ message: "Token y email son obligatorios" });
    }

    const hashedToken = crypto.createHash("sha256").update(String(token)).digest("hex");

    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
      emailVerificationToken: hashedToken,
    }).select("+emailVerificationToken +emailVerificationExpires");

    if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < Date.now()) {
      return res.status(400).json({ message: "El enlace es inválido o expiró. Pedí uno nuevo." });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Email confirmado", data: { emailVerified: true } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Reenvía el email de verificación. Requiere sesión: a diferencia de
 * forgot-password (que es anónimo por diseño, para no revelar si un email
 * existe), acá ya sabemos quién es —viene autenticado— así que no hace falta
 * ese cuidado, y sí conviene: emitir el token nuevo pisa cualquier link viejo
 * que hubiera quedado dando vueltas.
 */
const resendVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: "Tu email ya está confirmado" });
    }

    const verificationToken = issueEmailVerificationToken(user);
    await user.save();
    const result = await sendVerificationEmail(user, verificationToken);

    return res.status(200).json({
      message: "Te mandamos un nuevo enlace de verificación",
      ...(result.verifyUrl ? { verifyUrl: result.verifyUrl } : {}),
    });
  } catch (error) {
    return next(error);
  }
};

// Un solo cliente, reconstruido perezosamente: `getGoogleClient` explota recién
// al primer login con Google si falta la variable, no al arrancar el server
// (que sí debe poder levantar sin esto configurado — es opcional).
let googleClient = null;
const getGoogleClient = () => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    const error = new Error("Falta GOOGLE_CLIENT_ID en variables de entorno");
    error.statusCode = 500;
    throw error;
  }
  if (!googleClient) googleClient = new OAuth2Client(clientId);
  return { client: googleClient, clientId };
};

/**
 * Alta o inicio de sesión con "Continuar con Google".
 *
 * Recibe el `credential` (ID token JWT) que entrega el botón de Google
 * Identity Services en el navegador y lo verifica del lado del server contra
 * la API de Google — nunca se confía en un email que mande el cliente sin
 * probarlo, igual que nunca se confía una contraseña sin hashear.
 *
 * Por qué esto arregla el problema de fondo del mail que no llega: Google ya
 * verificó ese email cuando la persona creó SU cuenta de Google, así que acá
 * no hay ningún link que mandar ni SMTP del que depender — `emailVerified`
 * queda en `true` desde el primer instante.
 */
const googleAuth = async (req, res, next) => {
  try {
    const credential = String(req.body.credential || "").trim();
    if (!credential) {
      return res.status(400).json({ message: "Falta el credential de Google" });
    }

    const { client, clientId } = getGoogleClient();
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ message: "No pudimos validar tu cuenta de Google" });
    }

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ message: "Tu cuenta de Google no tiene el email verificado" });
    }

    const email = String(payload.email).trim().toLowerCase();
    const googleId = String(payload.sub);

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      user = await User.create({
        email,
        googleId,
        firstName: String(payload.given_name || payload.name || "").trim() || "Cuenta nueva",
        role: "user",
        emailVerified: true,
      });
    } else {
      // Cuenta existente (creada con mail+contraseña) que ahora entra por
      // Google por primera vez: se vincula en vez de crear un duplicado, y de
      // paso confirma el email si todavía no lo estaba — Google ya certificó
      // que es de quien dice ser.
      let dirty = false;
      if (!user.googleId) { user.googleId = googleId; dirty = true; }
      if (!user.emailVerified) { user.emailVerified = true; dirty = true; }
      if (dirty) await user.save();
    }

    const token = await startSession(res, user, req);
    return res.status(200).json(buildAuthResponse(user, token));
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
  verifyEmail,
  resendVerification,
  googleAuth,
};
