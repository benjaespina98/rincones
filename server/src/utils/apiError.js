/**
 * Respuesta 500 uniforme.
 *
 * Los controladores devolvían `error.message` al cliente en 23 lugares. Esos
 * mensajes los escribe el driver de Mongo o el runtime, no nosotros: traen
 * nombres de colecciones, rutas del servidor y hosts. No le sirven a quien usa
 * la app y sí a quien la quiera atacar.
 *
 * Acá el detalle se registra en el servidor —que es donde hace falta para
 * diagnosticar— y al cliente le llega algo que puede entender y accionar.
 */
const { captureException, flush } = require("../config/sentry");

/**
 * Async por el mismo motivo que `errorHandler.js`: en serverless la función
 * puede congelarse apenas se manda la respuesta, así que hay que esperar el
 * flush ANTES del `res.json`, no después. Los ~25 controladores que llaman
 * esto lo hacen como `return fail(res, error, req)` sin `await` — no hace
 * falta que lo esperen: la promesa sigue corriendo sola y la respuesta sale
 * cuando termina, esperar acá adentro alcanza.
 */
const fail = async (res, error, req) => {
  // Lo que es culpa del dato y no del servidor no es un 500: un id mal formado es "no existe" y
  // un valor fuera de rango es "corregí esto". Sin esto la persona veía "Algo falló de nuestro
  // lado" ante un error propio, sin saber qué cambiar.
  if (error?.name === "CastError") {
    return res.status(404).json({ success: false, error: "No lo encontramos" });
  }
  if (error?.name === "ValidationError") {
    const detalle = Object.values(error.errors || {})[0]?.message;
    return res.status(400).json({ success: false, error: detalle || "Hay un dato que no es válido" });
  }

  const ruta = req ? `${req.method} ${req.originalUrl}` : "";
  console.error("[error]", ruta, ":", error?.stack || error?.message || error);
  captureException(error, req ? { method: req.method, url: req.originalUrl } : undefined);
  await flush(2000);

  return res.status(500).json({
    success: false,
    error: "Algo falló de nuestro lado. Probá de nuevo en un momento.",
  });
};

module.exports = { fail };
