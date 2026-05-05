const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const app = require("../src/app");
const connectToDatabase = require("../src/config/db");

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
    "https://rincones.vercel.app",
    "https://www.rincones.vercel.app",
    "https://rincones-api.vercel.app",
    ...configuredOrigins,
  ]);
};

const allowedOrigins = parseAllowedOrigins();
const allowVercelPreviews =
  String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || "false").toLowerCase() === "true";
const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const getAllowedOrigin = (origin) => {
  if (!origin) {
    return null;
  }

  if (allowedOrigins.has(origin)) {
    return origin;
  }

  if (allowVercelPreviews && vercelPreviewPattern.test(origin)) {
    return origin;
  }

  return null;
};

const applyCorsHeaders = (req, res) => {
  const origin = String(req.headers.origin || "");
  const allowedOrigin = getAllowedOrigin(origin);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Vary", "Origin");
  }
};

module.exports = async (req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    return res.status(500).json({
      message: "Error al conectar con la base de datos",
      details: error.message,
    });
  }
};
