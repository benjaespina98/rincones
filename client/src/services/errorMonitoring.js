// Monitoreo de errores (Sentry), apagado por defecto — mismo criterio que
// server/src/config/sentry.js: sin VITE_SENTRY_DSN esto no hace nada, ni
// siquiera pide el paquete por red. El `import()` es dinámico a propósito: si
// no hay DSN, el bundle de Sentry (unos cuantos KB) nunca se descarga.
//
// Lo que se filtra antes de mandar cualquier evento: el header Authorization,
// cualquier cookie, y los campos de contraseña/token que puedan aparecer en el
// body de una request fallida.

let Sentry = null;

const isEnabled = () => Boolean(String(import.meta.env.VITE_SENTRY_DSN || "").trim());

const SENSITIVE_KEYS = [
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "refreshtoken",
  "authtoken",
  "resettoken",
];

const scrubObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const limpio = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(String(key).toLowerCase())) {
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
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.authorization;
    delete event.request.headers.Cookie;
  }
  if (event.request?.data) event.request.data = scrubObject(event.request.data);
  if (event.extra) event.extra = scrubObject(event.extra);
  return event;
};

/** Inicializa Sentry si hay DSN. Se llama una sola vez, al arrancar la app. */
export const initErrorMonitoring = async () => {
  if (!isEnabled()) return;

  Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    // Sólo errores, sin trazas de performance ni session replay: no es lo que
    // se pidió y en el plan gratuito la cuota se comparte con los eventos que
    // sí importan.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
};

/** Reporta un error de la app (boundary de React, o una respuesta 5xx de la API). */
export const captureError = (error, context) => {
  if (!isEnabled() || !Sentry) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // El monitoreo no puede ser la causa de un error nuevo.
  }
};
