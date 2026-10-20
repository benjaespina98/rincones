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
/**
 * `handler` en vez de `message`: por default, express-rate-limit manda el
 * mensaje con `response.send(message)` — texto plano, `Content-Type:
 * text/html`. El cliente lee `error.response.data.message` (como cualquier
 * otro error de la API, ver mensajeDeError en sommelierApi.js), y sobre un
 * string esa propiedad no existe: el mensaje que se escribió acá abajo
 * jamás llegaba, y el que se mostraba era siempre el genérico de "algo
 * falló". Con `handler` la respuesta es JSON, como el resto de la API.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Estás usando el escáner y la búsqueda muy seguido. Probá en un rato.",
    });
  },
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
  standardHeaders: true,
  legacyHeaders: false,
  // Mismo motivo que en `aiLimiter`: `handler` en vez de `message`, para que
  // el texto de verdad llegue como `{ message }` y no como texto plano.
  handler: (req, res) => {
    res.status(429).json({
      message: "Llegaste al límite de consultas por hoy. Mañana volvés a tener todas.",
    });
  },
});

/**
 * Techo DIARIO para escaneo y catálogo, por usuario. Es el mismo razonamiento
 * que en `sommelierDailyLimiter`: 60 por hora frena un bucle, pero no a una
 * sola cuenta que se pase el día entero gastando la cuota de todos.
 * 150 por día son varias compras enteras escaneadas. Al llegar, la app puede
 * seguir cargando vinos a mano; sólo se corta lo que gasta Gemini.
 */
const aiDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 150,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message:
        "Llegaste al límite de escaneos y búsquedas por hoy. Mañana volvés a tener todos; mientras tanto podés cargar el vino a mano.",
    });
  },
});

/**
 * Tope de intentos para lo que pide la contraseña con la sesión ya abierta: cambiarla y dar de
 * baja la cuenta.
 *
 * El login ya tiene su límite; estos dos aceptan la contraseña igual y, con un token robado,
 * permitían probar contraseñas sin freno. Va por USUARIO (la ruta exige sesión) y cuenta sólo los
 * intentos que FALLAN (`skipSuccessfulRequests`): 10 equivocaciones cada 15 minutos es mucho para
 * una persona que se confunde y nada para un bucle.
 */
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Probaste muchas veces con una contraseña que no es. Esperá unos minutos y volvé a intentar.",
    });
  },
});

module.exports = { aiLimiter, aiDailyLimiter, sommelierDailyLimiter, passwordLimiter };
