const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const app = require("../src/app");
const connectToDatabase = require("../src/config/db");
const { applyCorsHeaders } = require("../src/config/cors");

/**
 * El entrypoint de Vercel.
 *
 * ── LO ÚNICO QUE HACE, Y POR QUÉ NO HACE MÁS ────────────────────────────────
 * Asegura la conexión a la base (en serverless el proceso arranca frío) y le pasa
 * la petición a la app de Express. Nada más.
 *
 * Antes también reimplementaba CORS acá y contestaba el preflight por su cuenta,
 * ANTES de que Express viera la petición. Eso hacía que la política de `app.js`
 * —la que se lee, la que se testea, la que se toca cuando hay que cambiar algo—
 * no fuera la que regía en producción. Cuando se agregó PATCH a una lista y no a
 * la otra, el resultado fue que en producción el "+"/"−" del stock, pasar un
 * guardado a la bodega y marcar favorito dejaron de funcionar sin dejar rastro en
 * ningún log: el navegador rechazaba el preflight y la petición nunca salía.
 *
 * Ahora el preflight lo contesta Express con la misma configuración que el resto
 * (`app.options` en app.js) y acá no queda ninguna copia que pueda quedar vieja.
 */
module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    // Esta respuesta sale FUERA de Express, así que las cabeceras hay que ponerlas
    // a mano: sin ellas, una caída de la base le llega al navegador disfrazada de
    // error de CORS y el mensaje real queda oculto justo cuando más falta hace.
    applyCorsHeaders(req, res);
    return res.status(500).json({
      message: "Error al conectar con la base de datos",
      details: error.message,
    });
  }
};
