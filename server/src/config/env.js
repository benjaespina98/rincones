const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "JWT_SECRET",
  "FRONTEND_URL",
];

const validateEnvironment = () => {
  const missing = REQUIRED_ENV_VARS.filter((name) => !String(process.env[name] || "").trim());

  if (missing.length > 0) {
    const error = new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
    error.statusCode = 500;
    error.missingEnvVars = missing;
    throw error;
  }
};

module.exports = validateEnvironment;
