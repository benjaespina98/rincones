// Almacenamiento de imágenes en Cloudinary.
//
// Se activa SOLO si hay credenciales en el entorno (CLOUDINARY_URL, o bien
// CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET). Si no
// están configuradas, `store()` devuelve la imagen tal cual (base64) y la app
// sigue funcionando como antes — mismo patrón "gated" que usamos con Gemini.
//
// Ventaja de Cloudinary: guardamos una URL liviana en Mongo (no base64 pesado),
// y servimos la imagen optimizada con f_auto,q_auto y un tamaño acotado.

// Importante: el SDK de Cloudinary valida CLOUDINARY_URL apenas se importa y
// LANZA si está mal formado (ej: sin el prefijo cloudinary://). Eso crashearía
// todo el server. Por eso saneamos la variable ANTES de requerir el módulo y
// envolvemos el require en try/catch: una credencial mala nunca debe tumbar la API.
let cloudinary = null;
let configured = null; // null = todavía no se resolvió

/**
 * Resuelve la configuración la PRIMERA VEZ que se usa, no al importar el módulo.
 *
 * ── POR QUÉ PEREZOSA Y NO AL CARGAR ─────────────────────────────────────────
 * Porque leer el entorno al importar convierte al orden de los `require` en algo
 * que decide el comportamiento de la app, y eso ya falló: `server.js` requería la
 * app ANTES de cargar el .env, así que este módulo se configuraba con el entorno
 * vacío y quedaba apagado para siempre. Nada fallaba —el fallback devuelve la
 * imagen tal cual— pero todas las imágenes se guardaban en base64 adentro de Mongo
 * en vez de irse al CDN. Un bug sin síntomas, que se paga meses después.
 *
 * Se arregló ese orden, y además esto: cuando la configuración se resuelve al
 * primer uso, ya no hay ningún orden de importación que pueda romperla. Un arreglo
 * que depende de que nadie mueva un `require` no es un arreglo.
 */
const ensureConfigured = () => {
  if (configured !== null) return configured;

  const rawUrl = String(process.env.CLOUDINARY_URL || "").trim();
  if (rawUrl && !rawUrl.startsWith("cloudinary://")) {
    console.error(
      "CLOUDINARY_URL mal formado (debe empezar con 'cloudinary://'). Se ignora; se usa fallback base64."
    );
    delete process.env.CLOUDINARY_URL;
  }

  if (!cloudinary) {
    try {
      cloudinary = require("cloudinary").v2;
    } catch (error) {
      console.error("No se pudo inicializar Cloudinary, se usa fallback:", error.message);
      configured = false;
      return configured;
    }
  }

  const url = String(process.env.CLOUDINARY_URL || "").trim();
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const key = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const secret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  try {
    if (url) {
      // El SDK lee CLOUDINARY_URL del entorno automáticamente.
      cloudinary.config({ secure: true });
      configured = true;
    } else if (cloud && key && secret) {
      cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true });
      configured = true;
    } else {
      configured = false;
    }
  } catch (error) {
    console.error("Credenciales de Cloudinary inválidas, se usa fallback:", error.message);
    configured = false;
  }

  return configured;
};

const isConfigured = () => ensureConfigured();

// Entrega optimizada: formato y calidad automáticos, ancho acotado a 800px.
// Insertamos las transformaciones en la URL que ya devuelve Cloudinary.
const optimized = (url) => {
  if (typeof url !== "string") return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto,w_800,c_limit/");
};

/**
 * Sube una imagen (data URL base64 o URL http) a Cloudinary y devuelve la URL
 * optimizada. Si Cloudinary no está configurado o falla, devuelve la imagen
 * original (fallback), para no bloquear el alta del vino.
 */
const cloudDelEntorno = () => {
  const m = String(process.env.CLOUDINARY_URL || "").match(/@([^/?#]+)/);
  return ((m && m[1]) || String(process.env.CLOUDINARY_CLOUD_NAME || "")).trim().toLowerCase();
};

/** ¿Es una URL de NUESTRO cloud? Un cloud ajeno de Cloudinary sigue siendo un tercero. */
const esUrlPropia = (valor) => {
  const v = String(valor || "").trim();
  const base = "https://res.cloudinary.com/";
  if (!v.toLowerCase().startsWith(base)) return false;
  const cloud = cloudDelEntorno();
  if (!cloud) return true;
  return v.slice(base.length).toLowerCase().startsWith(cloud + "/");
};

const store = async (image, { folder = "rincones/wines" } = {}) => {
  const value = String(image || "").trim();
  if (!value) return "";
  // Si ya es una URL de Cloudinary, no la volvemos a subir.
  if (esUrlPropia(value)) return value;
  if (!ensureConfigured()) return value;

  try {
    const res = await cloudinary.uploader.upload(value, {
      folder,
      resource_type: "image",
      overwrite: false,
      // Transformación de ENTRADA: Cloudinary reduce la imagen ANTES de
      // guardarla, así no acumulamos el original de varios MB del celular.
      // Cap a 1600px (suficiente para retina) + calidad/formato automáticos.
      transformation: [{ width: 1600, crop: "limit", quality: "auto:good", fetch_format: "auto" }],
    });
    return optimized(res.secure_url || value);
  } catch {
    // Falla de red/credenciales: seguimos con la imagen original.
    return value;
  }
};

/**
 * El `public_id` de una imagen de NUESTRO Cloudinary, sacado de su URL; "" si la URL no es nuestra o no se entiende.
 * `.../upload/f_auto,q_auto,w_800,c_limit/v123/rincones/wines/abc.jpg` → `rincones/wines/abc`
 * (se salta la versión `v123` y las transformaciones, y se quita la extensión).
 */
const publicIdDeUrl = (url) => {
  const v = String(url || "").trim();
  if (!esUrlPropia(v)) return "";
  const m = v.match(/\/upload\/(.+)$/);
  if (!m) return "";
  const segmentos = m[1].split("?")[0].split("/");
  // Transformaciones: segmentos con comas o con forma "w_800" antes de la versión o de la carpeta.
  while (segmentos.length > 1 && (/^v\d+$/.test(segmentos[0]) || /^[a-z]{1,3}_[^/]*$/i.test(segmentos[0]) || segmentos[0].includes(","))) {
    segmentos.shift();
  }
  const ruta = segmentos.join("/").replace(/\.[a-z0-9]{2,5}$/i, "");
  return decodeURIComponent(ruta);
};

/**
 * Borra de Cloudinary las imágenes de ESTE cloud que se le pasan. Mejor esfuerzo: nunca lanza (un fallo de red no puede
 * frenar una baja de cuenta) y devuelve cuántas pidió borrar. Quien llama decide QUÉ borrar (que nada más las use).
 */
const eliminarImagenes = async (urls = []) => {
  const ids = [...new Set(urls.map(publicIdDeUrl).filter(Boolean))];
  if (ids.length === 0 || !ensureConfigured()) return 0;
  let pedidas = 0;
  for (const id of ids) {
    try {
      await cloudinary.uploader.destroy(id, { resource_type: "image", invalidate: true });
      pedidas += 1;
    } catch (error) {
      console.error("No se pudo borrar una imagen de Cloudinary:", id, error.message);
    }
  }
  return pedidas;
};

module.exports = {
  store,
  publicIdDeUrl,
  eliminarImagenes,
  esUrlPropia,
  isConfigured,
  optimized,
  /**
   * Sólo para los tests: vuelve a "todavía no resuelto".
   *
   * En la app real la configuración se resuelve una vez y no hay motivo para
   * rehacerla —las variables de entorno no cambian mientras el proceso vive—. El
   * test necesita observar la resolución más de una vez para comprobar justamente
   * que no depende de cuándo llegó el entorno.
   */
  __reiniciarConfiguracion: () => {
    configured = null;
  },
};
