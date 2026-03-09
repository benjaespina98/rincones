const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Error de validacion",
      errors: Object.values(err.errors).map((error) => error.message),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Parametro invalido" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      message: "Las imagenes pesan demasiado. Prueba con archivos mas chicos.",
    });
  }

  const statusCode = err.statusCode || 500;

  return res.status(statusCode).json({
    message: err.message || "Error interno del servidor",
  });
};

module.exports = errorHandler;
