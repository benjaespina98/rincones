const multer = require("multer");
const { captureException, flush } = require("../config/sentry");
const { recordError } = require("../services/errorLog.service");

/**
 * Manejador de errores final.
 *
 * Regla: los errores que el usuario puede corregir se explican; los internos NO
 * se cuentan. Antes cualquier 500 devolvía `err.message` tal cual al cliente, y
 * esos mensajes vienen del driver de Mongo, de fetch o del sistema de archivos:
 * nombres de colecciones, rutas del servidor, hosts. Nada de eso le sirve a
 * quien usa la app, y sí le sirve a quien la quiera atacar.
 */
const errorHandler = async (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Error de validación",
      errors: Object.values(err.errors).map((error) => error.message),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: "Parámetro inválido" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Las imágenes pesan demasiado. Probá con archivos más chicos.",
    });
  }

  // Multer: son errores del usuario (archivo grande, tipo equivocado), no del
  // servidor. Sin esto caían en el 500 genérico y no se entendía qué corregir.
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "La foto pesa demasiado. Probá con una más chica."
        : "No pudimos leer el archivo. Probá con otra foto.";
    return res.status(400).json({ success: false, message });
  }

  if (err.message === "El archivo tiene que ser una imagen") {
    return res.status(400).json({ success: false, message: err.message });
  }

  const statusCode = err.statusCode || 500;

  // Un 4xx con `statusCode` explícito es un mensaje que alguien escribió a
  // propósito para el usuario, así que se muestra. El 500 no.
  if (statusCode < 500) {
    return res.status(statusCode).json({
      success: false,
      message: err.message || "No pudimos completar la operación",
    });
  }

  // El detalle real queda en el servidor, que es donde sirve. Antes eso
  // quería decir "en la consola de la terminal, mientras alguien la esté
  // mirando": `recordError` deja el mismo detalle en la base, para el tab de
  // Logs del panel — no bloquea la respuesta (no lleva `await`, es
  // best-effort) por el mismo motivo que Sentry ya viaja aparte.
  console.error("[error]", req.method, req.originalUrl, "—", err.stack || err.message);
  recordError({ error: err, req, statusCode: 500 });
  captureException(err, { method: req.method, url: req.originalUrl });
  // En serverless la función puede congelarse apenas sale la respuesta de
  // abajo, antes de que el evento termine de mandarse. Esperar acá (sin
  // Sentry, no hace nada) es lo que evita perderlo justo en el caso que más
  // importa: un 500 en producción.
  await flush(2000);

  return res.status(500).json({
    success: false,
    message: "Algo falló de nuestro lado. Probá de nuevo en un momento.",
  });
};

module.exports = errorHandler;
