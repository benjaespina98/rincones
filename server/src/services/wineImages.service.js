// Pool compartido de fotos de vinos ("stock").
// Ver models/wineImage.model.js para el concepto.

const WineImage = require("../models/wineImage.model");
const { poolKey } = require("../data/wineIdentity");

// Clave del vino: nombre + uva + bodega. Los tres, para no mezclar homónimos ni
// dos uvas de la misma línea ("Saint Felicien Malbec" no es "Saint Felicien
// Cabernet"). Definida una sola vez en data/wineIdentity.js.
const wineKey = (name, winery, varietal) => poolKey(name, winery, varietal);

// Sólo guardamos fotos "de verdad" (data URL o http), no cadenas vacías.
const looksLikeImage = (value) =>
  typeof value === "string" && /^(data:image\/|https?:\/\/)/.test(value.trim());

/**
 * Aporta una foto al pool para un vino.
 *
 * ── QUIÉN PUEDE PISAR LA FOTO ───────────────────────────────────────────────
 * La primera foto que llega se queda: así, la de un desconocido no puede
 * reemplazar a otra sólo por ser más nueva, y nadie puede arruinar la foto de
 * un vino para todos los demás.
 *
 * La excepción es quien la aportó. Antes no existía y era un callejón sin
 * salida: si tu foto salió movida o con el flash en la etiqueta, quedaba de
 * cara visible de ese vino para toda la app y ni siquiera vos podías
 * cambiarla. Ahora sí — sólo vos, y sólo sobre la tuya.
 *
 * Best-effort: nunca lanza, para no romper el alta ni la edición del vino.
 */
const contribute = async ({ name, winery, varietal, image, userId }) => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key || !looksLikeImage(image)) return;

    const limpia = image.trim();
    const existente = await WineImage.findOne({ key }).select("contributedBy").lean();

    if (existente) {
      // Sólo el autor de la foto actual puede reemplazarla.
      if (!userId || String(existente.contributedBy || "") !== String(userId)) return;
      await WineImage.updateOne({ key }, { $set: { image: limpia } });
      return;
    }

    await WineImage.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          image: limpia,
          contributedBy: userId,
          name: String(name || "").trim(),
          winery: String(winery || "").trim(),
        },
      },
      { upsert: true }
    );
  } catch {
    // El pool es una mejora, no un requisito del alta.
  }
};

/**
 * Devuelve la foto del pool para un vino, o "" si no hay. Nunca lanza.
 */
const getImage = async (name, winery, varietal) => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key) return "";
    const doc = await WineImage.findOne({ key }).select("image").lean();
    return doc?.image || "";
  } catch {
    return "";
  }
};

/**
 * Enriquece una lista de resultados de búsqueda: a los que no tienen imagen les
 * pega la del pool si existe. Una sola consulta para toda la lista.
 */
const enrichWithImages = async (wines = []) => {
  const need = wines.filter(
    (w) => w && !looksLikeImage(w.image) && wineKey(w.name, w.winery, w.varietal)
  );
  if (need.length === 0) return wines;

  const keys = [...new Set(need.map((w) => wineKey(w.name, w.winery, w.varietal)))];
  let byKey = new Map();
  try {
    const docs = await WineImage.find({ key: { $in: keys } }).select("key image").lean();
    byKey = new Map(docs.map((d) => [d.key, d.image]));
  } catch {
    return wines;
  }

  return wines.map((w) => {
    if (looksLikeImage(w.image)) return w;
    const img = byKey.get(wineKey(w.name, w.winery, w.varietal));
    return img ? { ...w, image: img, imageSource: "community" } : w;
  });
};

module.exports = { contribute, getImage, enrichWithImages, wineKey };
