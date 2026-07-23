const jwt = require("jsonwebtoken");

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

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ 
      message: "Acceso denegado. Se requieren permisos de administrador.",
      requiredRole: "admin",
      userRole: req.user?.role,
    });
  }

  return next();
};

module.exports = {
  authenticate,
  requireAdmin,
};
