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
 * Canjea un refresh por uno nuevo (rotación), con ventana de gracia.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * Antes esto era un `findOneAndDelete`: el token viejo desaparecía en la misma
 * operación que lo encontraba. Seguro, y con un modo de falla que en un teléfono
 * ocurre seguido: si la respuesta no llegaba —red que se corta, pestaña que se
 * cierra, arranque en frío que se pasa del timeout del cliente— el token viejo
 * ya no existía y el nuevo se había perdido en el camino. La sesión moría sin
 * que nadie hiciera nada mal. Es el "a veces me manda al login".
 *
 * ── CÓMO SE DISTINGUE UNA RESPUESTA PERDIDA DE UN ROBO ──────────────────────
 * Por el ESTADO DEL REEMPLAZO, no por el tiempo. Una ventana temporal no alcanza
 * porque el reintento puede tardar minutos (el usuario deja el teléfono y vuelve
 * después), y una ventana lo bastante larga para cubrir eso deja de detectar
 * nada. El estado del reemplazo, en cambio, contesta la pregunta exacta:
 *
 *   ¿el sucesor de este token llegó a usarse alguna vez?
 *     NO  → nadie recibió el sucesor. Es el dueño reintentando algo que se
 *           perdió: se descarta ese sucesor huérfano y se emite uno nuevo.
 *     SÍ  → el dueño sí recibió el sucesor y siguió con él. Que ahora aparezca
 *           alguien con el token ANTERIOR significa que lo tenía copiado:
 *           se cierran todas las sesiones del usuario.
 *
 * Devuelve `{ reused: true }` en ese último caso para que el controlador pueda
 * responder distinto de un "no existe".
 */
/** Cuántas veces se puede re-canjear un token ya usado cuyo sucesor nadie estrenó. */
const MAX_REINTENTOS_DE_GRACIA = 3;

const rotateRefreshToken = async (token, userAgent = "") => {
  if (!token) return null;

  const existente = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!existente) return null;
  if (existente.expiresAt.getTime() < Date.now()) {
    await RefreshToken.deleteOne({ _id: existente._id });
    return null;
  }

  if (existente.usedAt) {
    const sucesor = existente.replacedByHash
      ? await RefreshToken.findOne({ tokenHash: existente.replacedByHash })
      : null;

    // El sucesor ya circuló (o ya fue rotado él mismo): esto es un reuso real.
    if (!sucesor || sucesor.usedAt) {
      await revokeAllForUser(existente.userId);
      return { reused: true, userId: existente.userId };
    }

    // El sucesor existe y nunca se usó: nadie lo recibió. Se descarta y se emite
    // uno nuevo, que es lo que el dueño está pidiendo.
    //
    // Con un tope. Sin él, quien copió este token podía canjearlo una y otra vez
    // mientras se cuidara de no estrenar el sucesor, y de paso le iba borrando el
    // suyo al dueño: una sesión robada que no vencía en 30 días y que la
    // detección de reuso nunca veía. Una respuesta perdida se reintenta una vez,
    // a lo sumo dos; más que eso sobre el MISMO token no es mala señal de red.
    if ((existente.graceCount || 0) >= MAX_REINTENTOS_DE_GRACIA) {
      await revokeAllForUser(existente.userId);
      return { reused: true, userId: existente.userId };
    }
    existente.graceCount = (existente.graceCount || 0) + 1;
    await RefreshToken.deleteOne({ _id: sucesor._id });
  }

  const nuevo = await issueRefreshToken(existente.userId, userAgent);

  // El viejo queda marcado y encadenado a su reemplazo. No se borra: es lo que
  // permite reconocer el reintento legítimo la próxima vez. Se lo lleva el TTL
  // de `expiresAt` como a cualquier otro.
  existente.usedAt = new Date();
  existente.replacedByHash = hashToken(nuevo.token);
  await existente.save();

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

/**
 * ── POR QUÉ EL DEFAULT YA NO ES `none` ──────────────────────────────────────
 *
 * `none` significa "mandá esta cookie también cuando la petición sale de OTRO
 * sitio". Era necesario mientras el cliente le pegaba a la API por su dominio
 * propio (`rincones-api.vercel.app` desde `rincones.vercel.app`): dos sitios
 * distintos, porque `vercel.app` está en la Public Suffix List.
 *
 * Esa era justamente la causa de "se me cierra la sesión sola" — ver el
 * comentario largo en `client/src/services/api.js`. El cliente ahora sale
 * siempre por el mismo origen (`/api`, que Vercel reescribe hacia la API), así
 * que la cookie nunca más viaja cross-site y `none` pasó de ser necesario a ser
 * dos problemas gratis:
 *
 *   - Es la cookie que los navegadores tratan como de terceros: Safari la
 *     bloquea, Chrome la restringe, Firefox la aísla. Aunque hoy se use
 *     first-party, es la categoría con la vida útil más corta y más recortable.
 *   - Es la que habilita CSRF: `none` hace que un POST desde cualquier sitio
 *     lleve la sesión puesta.
 *
 * `lax` es lo correcto para una API del mismo origen: se manda en todo lo que
 * la app hace y no en lo que hace un sitio ajeno. El override sigue estando por
 * si algún día el front y la API viven de verdad en sitios separados — pero eso
 * hay que elegirlo a mano, sabiendo lo de arriba, y no heredarlo de un default.
 */
const getAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredSameSite = String(process.env.COOKIE_SAMESITE || "").trim().toLowerCase();
  const sameSite = ["strict", "lax", "none"].includes(configuredSameSite)
    ? configuredSameSite
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
