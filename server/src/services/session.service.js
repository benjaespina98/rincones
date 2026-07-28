const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/refreshToken.model");

/**
 * Sesiones: un token de acceso corto + un refresh largo y revocable.
 *
 * Antes había un solo JWT de 7 días. Un JWT no se puede invalidar: mientras no
 * expire, vale. Cerrar sesión sólo borraba la cookie del navegador que la tenía,
 * así que un token copiado seguía andando una semana, y cambiar la contraseña
 * no cortaba nada.
 *
 * Ahora el de acceso dura 15 minutos —el daño de uno robado se acota a eso— y
 * el refresh vive en la base, donde se puede borrar.
 */

const ACCESS_TTL = "15m";
const REFRESH_DAYS = 30;

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error("Falta JWT_SECRET en variables de entorno");
    error.statusCode = 500;
    throw error;
  }
  return secret;
};

const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user._id), role: user.role, email: user.email },
    getJwtSecret(),
    { expiresIn: ACCESS_TTL }
  );

// SHA-256 y no bcrypt a propósito: el token ya es aleatorio de 256 bits, así que
// no hay nada que "adivinar" y no hace falta un hash lento. Además esto corre en
// cada refresh y bcrypt lo volvería caro sin ganar seguridad.
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Crea una sesión nueva y devuelve el refresh en claro (se manda una sola vez). */
const issueRefreshToken = async (userId, userAgent = "") => {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    userAgent: String(userAgent || "").slice(0, 200),
    expiresAt,
  });

  return { token, expiresAt };
};

/**
 * Canjea un refresh por uno nuevo (rotación).
 *
 * Se borra el viejo en la MISMA operación que lo busca: si dos pestañas
 * refrescan a la vez, sólo una encuentra el documento y la otra recibe 401 en
 * lugar de que las dos obtengan sesiones válidas del mismo token.
 *
 * Rotar además convierte el robo en algo detectable: un token usado dos veces ya
 * no existe la segunda vez.
 */
const rotateRefreshToken = async (token, userAgent = "") => {
  if (!token) return null;

  const existente = await RefreshToken.findOneAndDelete({ tokenHash: hashToken(token) });
  if (!existente) return null;
  if (existente.expiresAt.getTime() < Date.now()) return null;

  const nuevo = await issueRefreshToken(existente.userId, userAgent);
  return { userId: existente.userId, ...nuevo };
};

/** Cierra ESTA sesión. */
const revokeRefreshToken = async (token) => {
  if (!token) return;
  await RefreshToken.deleteOne({ tokenHash: hashToken(token) });
};

/**
 * Cierra TODAS las sesiones del usuario.
 *
 * Es lo que corresponde al cambiar la contraseña o al restablecerla: si alguien
 * más tenía acceso, ese es justo el momento en que hay que echarlo.
 */
const revokeAllForUser = async (userId) => {
  await RefreshToken.deleteMany({ userId });
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

// Guardar token en httpOnly cookie
const setAuthCookie = (res, token) => {
  res.cookie("authToken", token, {
    ...getAuthCookieOptions(),
    maxAge: 15 * 60 * 1000, // igual que la vida del token de acceso
  });
};

// El refresh va SÓLO en cookie httpOnly y nunca en el body: es la credencial de
// larga duración, y guardarla en localStorage la dejaría al alcance de cualquier
// script. El de acceso sí puede ir por header porque dura 15 minutos.
const setRefreshCookie = (res, token, expiresAt) => {
  res.cookie("refreshToken", token, {
    ...getAuthCookieOptions(),
    // Sólo se manda a la ruta que la necesita: no viaja en cada request.
    path: "/api/auth",
    expires: expiresAt,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie("authToken", getAuthCookieOptions());
  res.clearCookie("refreshToken", { ...getAuthCookieOptions(), path: "/api/auth" });
};

/** Abre sesión: token corto por body/cookie + refresh revocable en cookie. */
const startSession = async (res, user, req) => {
  const token = signAccessToken(user);
  setAuthCookie(res, token);

  const { token: refresh, expiresAt } = await issueRefreshToken(
    user._id,
    req?.get?.("user-agent")
  );
  setRefreshCookie(res, refresh, expiresAt);

  return token;
};

module.exports = {
  ACCESS_TTL,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookies,
  startSession,
  REFRESH_DAYS,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
