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
const fail = (res, error, req) => {
  const ruta = req ? `${req.method} ${req.originalUrl}` : "";
  console.error("[error]", ruta, "—", error?.stack || error?.message || error);

  return res.status(500).json({
    success: false,
    error: "Algo falló de nuestro lado. Probá de nuevo en un momento.",
  });
};

module.exports = { fail };
