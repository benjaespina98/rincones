const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const { corsOptions } = require("./config/cors");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const labelsRoutes = require("./routes/labels.routes");
const catalogRoutes = require("./routes/catalog.routes");
const winesRoutes = require("./routes/wines.routes");
const wishesRoutes = require("./routes/wishes.routes");
const usersRoutes = require("./routes/users.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const promotionsRoutes = require("./routes/promotions.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Cuando se ejecuta detrás de un proxy (Vercel, Heroku, etc.), habilitar
// 'trust proxy' para que express-rate-limit y otros middlewares lean correctamente
// la IP real del cliente desde `X-Forwarded-For`.
app.set("trust proxy", 1);

// Security: HTTP Headers
app.use(helmet());

// Security: Rate limiting.
// El límite general es amplio porque la app es una SPA que hace varias llamadas
// por pantalla (destacados, búsquedas del sommelier, etc.). Detrás de un NAT
// varios usuarios comparten IP, así que un límite muy bajo cortaría a gente real.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 600,
  message: "Demasiadas solicitudes, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
  // La ingesta de métricas queda afuera de la cuota general y tiene la suya
  // propia (ver routes/analytics.routes.js). Si compartiera este presupuesto,
  // medir le comería los pedidos a las cosas que el usuario sí necesita: una
  // sesión larga mandaría decenas de eventos y podría dejar sin cuota a la
  // pantalla siguiente. Y al revés: alguien usando mucho la app se quedaría sin
  // poder reportar nada, sesgando justo los datos de los usuarios más activos.
  // Lo mismo vale para el conteo de impresiones de los destacados: tiene su propio
  // límite (ver routes/promotions.routes.js) y no puede comerle cuota a lo que el
  // usuario necesita.
  skip: (req) =>
    req.path === "/api/analytics/collect" || req.path === "/api/promotions/events",
});

// Aplicar rate limiting más estricto a login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de login
  message: "Demasiados intentos de login, intenta en 15 minutos",
  skipSuccessfulRequests: true, // no contar requests exitosos
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter específico para forgot-password (proteger abuso)
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // máximo 5 solicitudes por IP por hora
  message: "Demasiadas solicitudes de restablecimiento, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
});

// La política vive en config/cors.js, no acá. Estaba escrita también en el
// entrypoint de Vercel y las dos copias se separaron: PATCH quedó permitido en
// esta y no en la otra, y eso rompió en producción —sólo en producción— el "+"/"−"
// del stock, pasar un guardado a la bodega y marcar favorito en Guardados.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// El rate limiter va DESPUÉS de CORS: si no, una respuesta 429 sale sin las
// cabeceras Access-Control-* y el browser la reporta como error de CORS en vez
// de "demasiadas solicitudes", ocultando la causa real.
app.use(limiter);

app.use(cookieParser()); // Parsear cookies
app.use(express.json({ limit: "12mb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    service: "rincones-server",
    status: "ok",
    health: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/forgot-password", forgotLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/labels", labelsRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/wines", winesRoutes);
app.use("/api/wishes", wishesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/promotions", promotionsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);

module.exports = app;
