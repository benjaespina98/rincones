/**
 * La política de CORS, en UN solo lugar.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
 * Estaba escrita dos veces: en `app.js` (que es la que corre en desarrollo) y en
 * `api/index.js` (el entrypoint de Vercel, que además contesta el preflight ANTES
 * de que Express vea la petición). Dos copias de una regla de seguridad es un bug
 * esperando la fecha, y la fecha ya pasó:
 *
 * `PATCH` se agregó a la lista de `app.js` y NADIE lo agregó a la del entrypoint.
 * Resultado: en desarrollo andaba todo y en producción fallaban en silencio las
 * tres funciones que usan PATCH —ajustar el stock con "+"/"−", pasar un guardado a
 * la bodega y marcar favorito en Guardados—. El navegador rechazaba el preflight,
 * así que la petición nunca salía: en el server no quedaba ni rastro del error y en
 * la app el botón simplemente no hacía nada.
 *
 * Es el peor tipo de bug posible: invisible en los logs, imposible de reproducir
 * localmente y con un síntoma ("a veces los botones no responden") que manda a
 * buscar en el lugar equivocado. Con la lista acá, agregar un método vuelve a ser
 * una sola línea en un solo archivo.
 */

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const CABECERAS = ["Content-Type", "Authorization"];

const parseAllowedOrigins = () => {
  const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    // Vite salta al siguiente puerto libre cuando 5173 está ocupado, y el primero
    // al que salta es 5174 — que era justamente el que faltaba en esta lista. El
    // síntoma es desconcertante: la app carga pero TODAS las llamadas fallan por
    // CORS, y sólo porque quedó otro `npm run dev` abierto en otra terminal.
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "https://rincones.vercel.app",
    "https://www.rincones.vercel.app",
    "https://rincones-api.vercel.app",
    ...configuredOrigins,
  ]);
};

/**
 * Se resuelve al cargar el módulo y no en cada petición: la lista sale de
 * variables de entorno, que no cambian mientras el proceso vive.
 */
const allowedOrigins = parseAllowedOrigins();
const allowVercelPreviews =
  String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || "false").toLowerCase() === "true";
const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

/** El origen si está permitido, `null` si no. */
const allowedOriginFor = (origin) => {
  if (!origin) return null;
  if (allowedOrigins.has(origin)) return origin;
  if (allowVercelPreviews && vercelPreviewPattern.test(origin)) return origin;
  return null;
};

/** Las opciones para el middleware `cors` de Express. */
const corsOptions = {
  origin(origin, callback) {
    // Sin `Origin` no es una petición de navegador (curl, un health check, el
    // propio Vercel): no hay nada que restringir.
    if (!origin || allowedOriginFor(origin)) return callback(null, true);

    const error = new Error("Origen no permitido por CORS");
    error.statusCode = 403;
    return callback(error);
  },
  methods: METODOS,
  allowedHeaders: CABECERAS,
  credentials: true, // Permitir cookies
};

/**
 * Las mismas cabeceras, aplicadas a mano.
 *
 * Sirve para las respuestas que salen ANTES o FUERA de Express —en Vercel, el
 * error de conexión a la base—. Sin ellas, una caída de la base le llega al
 * navegador como un error de CORS y el mensaje real ("no se pudo conectar a la
 * base") queda oculto justo cuando más falta hace.
 */
const applyCorsHeaders = (req, res) => {
  const allowed = allowedOriginFor(String(req.headers.origin || ""));
  if (!allowed) return;

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", METODOS.join(","));
  res.setHeader("Access-Control-Allow-Headers", CABECERAS.join(","));
  res.setHeader("Vary", "Origin");
};

module.exports = { corsOptions, applyCorsHeaders, allowedOriginFor, METODOS };
