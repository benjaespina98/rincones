const rateLimit = require("express-rate-limit");

/**
 * Límite para los endpoints que llaman a Gemini.
 *
 * Estos gastan CUOTA, no sólo CPU. El plan gratuito da del orden de 1.000
 * pedidos por día y por modelo, así que el límite general de la app (600 cada
 * 15 minutos) alcanza para que una sola persona funda el día entero antes del
 * mediodía.
 *
 * Se cuenta por USUARIO y no por IP: estos endpoints exigen sesión, y detrás de
 * un NAT hay muchas personas compartiendo IP. Por eso va SIEMPRE después de
 * `authenticate` — antes, `req.user` no existe todavía y caería al fallback.
 *
 * 60 por hora es holgado para uso real (escanear una compra entera son unas
 * pocas llamadas, y las búsquedas del catálogo curado ni siquiera llegan al
 * modelo) y a la vez impide que un bucle accidental se coma el día.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: "Estás usando el escáner y la búsqueda muy seguido. Probá en un rato.",
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { aiLimiter };
