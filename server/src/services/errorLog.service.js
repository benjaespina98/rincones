const ErrorLog = require("../models/errorLog.model");

/**
 * Deja constancia de un fallo del servidor, en la base — no sólo en la
 * consola. Best-effort y a propósito silencioso: un error de verdad nunca
 * puede terminar de romperse porque el INTENTO de registrarlo también falló
 * (Mongo caído, lo que sea). Mismo criterio que `logAdminAction` en
 * admin.controller.js.
 */
const recordError = async ({ error, req, statusCode } = {}) => {
  try {
    await ErrorLog.create({
      message: String(error?.message || error || "Error sin mensaje").slice(0, 500),
      stack: String(error?.stack || "").slice(0, 4000),
      method: req?.method || "",
      route: req?.originalUrl || "",
      statusCode: statusCode || error?.statusCode || 500,
      userId: req?.user?.id || null,
    });
  } catch {
    // Ver el comentario de arriba: nunca romper nada por esto.
  }
};

module.exports = { recordError };
