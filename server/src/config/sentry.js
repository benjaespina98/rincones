// Monitoreo de errores (Sentry), apagado por defecto.
//
// Sin SENTRY_DSN esto no hace nada — ni siquiera carga el paquete —, igual que
// el resto de las integraciones opcionales del proyecto (Gemini, Cloudinary,
// SMTP): la app tiene que arrancar y funcionar igual sin la variable. Con la
// variable puesta, captura los errores 500 de verdad (los 4xx son respuestas
// esperadas, no fallas) y las excepciones no controladas del proceso.
//
// Lo que NUNCA viaja a Sentry, filtrado en `scrubEvent` antes de mandar
// cualquier evento: el header Authorization, las cookies (ahí van el access y
// el refresh token), passwords y tokens de reset que puedan venir en el body
// de una request, y cualquier API key de las variables de entorno que Sentry
// intente adjuntar como contexto.

let Sentry = null;
let initialized = false;

const isEnabled = () => Boolean(String(process.env.SENTRY_DSN || "").trim());

/**
 * Fragmentos de nombre de clave que hacen sensible cualquier valor que
 * acompañen — "authtoken", "refreshToken" y "clientSecret" caen todos bajo
 * "token"/"secret" sin tener que enumerar cada variante a mano.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
];

const isSensitiveKey = (key) => {
  const normalizado = String(key).toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_FRAGMENTS.some((fragmento) => normalizado.includes(fragmento));
};

/**
 * Reemplaza por "[filtrado]" el valor de toda clave sensible, recorriendo
 * objetos y arrays anidados. Se aplica tanto a `event.request` (headers, body)
 * como a `event.extra` (el contexto que le pasa `captureException`): son dos
 * lugares distintos donde un dato sensible puede colarse, y hasta ahora sólo
 * se limpiaba el primero.
 */
const scrubObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const limpio = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      limpio[key] = "[filtrado]";
    } else if (value && typeof value === "object") {
      limpio[key] = scrubObject(value);
    } else {
      limpio[key] = value;
    }
  }
  return limpio;
};

const scrubEvent = (event) => {
  if (event.request) {
    if (event.request.headers) event.request.headers = scrubObject(event.request.headers);
    if (event.request.cookies) delete event.request.cookies;
    if (event.request.data) event.request.data = scrubObject(event.request.data);
  }
  if (event.extra) event.extra = scrubObject(event.extra);
  return event;
};

/** Inicializa Sentry si hay DSN. Llamar UNA vez, antes de levantar la app. */
const initSentry = () => {
  if (initialized) return;
  initialized = true; // se marca antes: si init() tira, no reintenta en cada request

  if (!isEnabled()) return;

  Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // El SHA del commit si Vercel lo expone; sirve para saber en qué versión
    // pasó el error sin mantener un número de versión a mano.
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // Sólo errores: sin trazas de performance. No es lo que se pidió y en el
    // plan gratuito la cuota se comparte con los eventos de error, que son los
    // que importan acá.
    tracesSampleRate: 0,
    // Explícito y no confiado al default: IPs, cookies y headers no viajan
    // salvo que `scrubEvent` los deje pasar (y no los deja).
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
};

/**
 * Reporta una excepción si Sentry está activo; si no, no hace nada.
 *
 * Se llama a mano en los DOS lugares donde el backend termina un error 500
 * (`middleware/errorHandler.js` y `utils/apiError.js`), y no como middleware
 * de Express: la mitad de los controladores responde con `fail()` en vez de
 * `next(error)`, así que un middleware de errores de Express no los vería
 * nunca. Con los dos puntos ya cubre el 100% de los 500 sin reportar nada dos
 * veces.
 */
const captureException = (error, context) => {
  if (!isEnabled() || !Sentry) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // El monitoreo no puede ser la causa de un error nuevo.
  }
};

/**
 * Espera a que los eventos ya encolados terminen de mandarse (o hasta
 * `timeoutMs`, lo que pase primero). Hace falta en serverless: la función
 * puede congelarse apenas se manda la respuesta, ANTES de que el request HTTP
 * a Sentry termine, y el evento se pierde sin ningún aviso. No hace nada si
 * Sentry está apagado, así que llamarlo siempre es seguro.
 */
const flush = async (timeoutMs = 2000) => {
  if (!isEnabled() || !Sentry) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Ni el flush puede ser la causa de que una respuesta no salga.
  }
};

module.exports = { initSentry, captureException, flush, isEnabled };
