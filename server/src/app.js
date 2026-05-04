const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const lugaresRoutes = require("./routes/lugares.routes");
const placesRoutes = require("./routes/places.routes");
const geocodingRoutes = require("./routes/geocoding.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const labelsRoutes = require("./routes/labels.routes");
const winesRoutes = require("./routes/wines.routes");
const usersRoutes = require("./routes/users.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Cuando se ejecuta detrás de un proxy (Vercel, Heroku, etc.), habilitar
// 'trust proxy' para que express-rate-limit y otros middlewares lean correctamente
// la IP real del cliente desde `X-Forwarded-For`.
app.set("trust proxy", 1);

// Security: HTTP Headers
app.use(helmet());

// Security: Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: "Demasiadas solicitudes, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
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

app.use(limiter);

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
    "http://localhost:5177",
    "http://localhost:5176",
    "http://localhost:5175",
    ...configuredOrigins,
  ]);
};

const allowedOrigins = parseAllowedOrigins();
const allowVercelPreviews = String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || "false").toLowerCase() === "true";
const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    if (allowVercelPreviews && vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }

    const error = new Error("Origen no permitido por CORS");
    error.statusCode = 403;
    return callback(error);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Permitir cookies
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
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
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/geocode", geocodingRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/lugares", lugaresRoutes);
app.use("/api/labels", labelsRoutes);
app.use("/api/wines", winesRoutes);
app.use("/api/users", usersRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);

module.exports = app;
