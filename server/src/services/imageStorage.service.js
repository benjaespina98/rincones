// Almacenamiento de imágenes en Cloudinary.
//
// Se activa SOLO si hay credenciales en el entorno (CLOUDINARY_URL, o bien
// CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET). Si no
// están configuradas, `store()` devuelve la imagen tal cual (base64) y la app
// sigue funcionando como antes — mismo patrón "gated" que usamos con Gemini.
//
// Ventaja de Cloudinary: guardamos una URL liviana en Mongo (no base64 pesado),
// y servimos la imagen optimizada con f_auto,q_auto y un tamaño acotado.

const { v2: cloudinary } = require("cloudinary");

let configured = false;
(() => {
  const url = String(process.env.CLOUDINARY_URL || "").trim();
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const key = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const secret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (url) {
    // El SDK lee CLOUDINARY_URL del entorno automáticamente.
    cloudinary.config({ secure: true });
    configured = true;
  } else if (cloud && key && secret) {
    cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true });
    configured = true;
  }
})();

const isConfigured = () => configured;

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
const store = async (image, { folder = "rincones/wines" } = {}) => {
  const value = String(image || "").trim();
  if (!value) return "";
  // Si ya es una URL de Cloudinary, no la volvemos a subir.
  if (/res\.cloudinary\.com/.test(value)) return value;
  if (!configured) return value;

  try {
    const res = await cloudinary.uploader.upload(value, {
      folder,
      resource_type: "image",
      overwrite: false,
    });
    return optimized(res.secure_url || value);
  } catch {
    // Falla de red/credenciales: seguimos con la imagen original.
    return value;
  }
};

module.exports = { store, isConfigured, optimized };
