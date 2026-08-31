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

/**
 * El techo DIARIO de la guía de vino.
 *
 * `aiLimiter` (60 por hora) frena un bucle roto, pero no un uso intenso y
 * legítimo: 60 por hora, ocho horas seguidas, son 480 consultas de una sola
 * persona en un día — más cuota de la que el plan gratuito da para todos los
 * usuarios juntos. Conversar invita a seguir preguntando de una forma en que
 * escanear una etiqueta no, así que la guía necesita su propio techo por día.
 *
 * 40 es holgado de verdad: una consulta real son tres o cuatro preguntas
 * seguidas, y eso son diez conversaciones enteras en un día. Quien lo toque
 * está jugando con la app, no usándola, y el mensaje se lo dice sin retarlo.
 *
 * Va por USUARIO y no por IP, igual que `aiLimiter` y por lo mismo: la ruta
 * exige sesión, y detrás de un NAT hay muchas personas compartiendo IP.
 */
const sommelierDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: "Llegaste al límite de consultas por hoy. Mañana volvés a tener todas.",
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { aiLimiter, sommelierDailyLimiter };
