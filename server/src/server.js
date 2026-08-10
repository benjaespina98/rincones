const dotenv = require("dotenv");
const path = require("path");

/**
 * El .env se carga ANTES de requerir cualquier cosa de la app. No es estilo: es
 * un bug que estuvo activo y no daba ninguna señal.
 *
 * `require` ejecuta el módulo en el acto, así que `require("./app")` arrastraba
 * todo el árbol —rutas, controladores, servicios— con el entorno todavía vacío. Y
 * hay servicios que leen su configuración al cargarse: `imageStorage.service.js`
 * mira `CLOUDINARY_URL` en ese momento. Al no encontrarla quedaba desconfigurado
 * para siempre, y como su fallback es devolver la imagen tal cual (a propósito:
 * una foto no puede impedir cargar un vino), TODAS las imágenes —vinos, momentos,
 * etiquetas escaneadas, logos de anunciantes— se guardaban en base64 adentro de
 * Mongo en vez de subirse al CDN.
 *
 * No fallaba nada. Los documentos simplemente engordaban cientos de KB cada uno,
 * y sólo se iba a notar mucho después, como "la app está lenta" o como una factura.
 *
 * El entrypoint de Vercel ya lo hacía en este orden, así que producción estaba
 * bien y desarrollo no: la peor combinación para darse cuenta.
 */
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Después del .env (necesita SENTRY_DSN) y antes que todo lo demás: si algo
// explota al cargar la app, este es el único momento en que Sentry ya está
// listo para verlo.
const { initSentry, captureException, flush } = require("./config/sentry");
initSentry();

const app = require("./app");
const connectToDatabase = require("./config/db");
const validateEnvironment = require("./config/env");

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    validateEnvironment();
    await connectToDatabase();

    app.listen(PORT, () => {
      console.log(`Servidor iniciado en http://localhost:${PORT}`);
    });
  } catch (error) {
    // No sólo el arranque local: si algo llega a fallar acá, es antes de que
    // haya un solo request atendido, así que sin esto el fallo quedaba sólo en
    // la consola de quien tuviera la terminal abierta en ese momento.
    console.error("Error al iniciar el servidor:", error.message);
    captureException(error, { origin: "server-startup" });
    // El proceso está a punto de terminar (`process.exit` de la línea de
    // abajo): sin esperar el flush, el evento puede quedar a mitad de camino y
    // perderse con el proceso, igual que en serverless.
    await flush(3000);
    process.exit(1);
  }
};

startServer();
