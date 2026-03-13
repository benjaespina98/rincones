const express = require("express");
const cors = require("cors");

const lugaresRoutes = require("./routes/lugares.routes");
const placesRoutes = require("./routes/places.routes");
const geocodingRoutes = require("./routes/geocoding.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

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
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
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

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/geocode", geocodingRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/lugares", lugaresRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);

module.exports = app;
