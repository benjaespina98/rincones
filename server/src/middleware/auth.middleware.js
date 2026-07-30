const jwt = require("jsonwebtoken");
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

const authenticate = (req, res, next) => {
  // Aceptamos el token por header Authorization: Bearer <token> (robusto, funciona
  // en Safari/iOS y cross-dominio) y, como respaldo, por cookie httpOnly.
  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const token = bearerToken || req.cookies?.authToken || null;

  if (!token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Token invalido o expirado" });
  }
};

/**
 * Igual que `authenticate`, pero sin exigir nada: si hay token válido deja
 * `req.user` puesto y si no, sigue como visitante anónimo.
 *
 * Es para las rutas que atienden a las dos poblaciones. La ingesta de analytics
 * es el caso claro: los visitantes SIN sesión son justamente los que hay que
 * poder contar, así que exigir token mediría sólo a los que ya se registraron —el
 * número menos interesante de los dos—. Y a la vez, cuando hay sesión, saber que
 * la había vale.
 *
 * Nunca corta la cadena con un 401: un token vencido no puede impedirte usar la
 * parte pública de la app.
 */
const optionalAuth = (req, _res, next) => {
  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = bearerToken || req.cookies?.authToken || null;

  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      // Token inválido o vencido: se sigue como anónimo, que es lo correcto acá.
    }
  }

  return next();
};

/**
 * Exige rol admin, verificándolo contra la BASE y no contra el token.
 *
 * El JWT lleva el rol que tenía el usuario cuando inició sesión, así que
 * confiar en él tenía dos consecuencias malas:
 *  - Promover a alguien no surtía efecto hasta que cerrara y volviera a abrir
 *    sesión (parecía que la promoción no había funcionado).
 *  - Peor: QUITAR el admin no revocaba nada. El token viejo seguía teniendo
 *    permisos de administrador hasta vencer.
 *
 * Es una consulta extra, pero sólo en rutas de admin (bajísimo tráfico).
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Token requerido" });
    }

    const user = await User.findById(req.user.id).select("role").lean();
    if (!user) {
      return res.status(401).json({ message: "La cuenta ya no existe" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        message: "Acceso denegado. Se requieren permisos de administrador.",
        requiredRole: "admin",
        userRole: user.role,
      });
    }

    // El rol real manda sobre el del token para todo lo que venga después.
    req.user.role = user.role;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
};
