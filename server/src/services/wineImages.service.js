// Pool compartido de fotos de vinos ("stock").
// Ver models/wineImage.model.js para el concepto.

const WineImage = require("../models/wineImage.model");

const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Clave del vino: nombre + bodega. Necesita ambos para no mezclar homónimos.
const wineKey = (name, winery) => {
  const n = fold(name);
  const w = fold(winery);
  if (n.length < 3) return null;
  return `${n}|${w}`;
};

// Sólo guardamos fotos "de verdad" (data URL o http), no cadenas vacías.
const looksLikeImage = (value) =>
  typeof value === "string" && /^(data:image\/|https?:\/\/)/.test(value.trim());

/**
 * Aporta una foto al pool para un vino. No pisa la existente (nos quedamos con
 * la primera). Best-effort: nunca lanza, para no romper el alta del vino.
 */
const contribute = async ({ name, winery, image, userId }) => {
  try {
    const key = wineKey(name, winery);
    if (!key || !looksLikeImage(image)) return;

    await WineImage.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          image: image.trim(),
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
const getImage = async (name, winery) => {
  try {
    const key = wineKey(name, winery);
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
  const need = wines.filter((w) => w && !looksLikeImage(w.image) && wineKey(w.name, w.winery));
  if (need.length === 0) return wines;

  const keys = [...new Set(need.map((w) => wineKey(w.name, w.winery)))];
  let byKey = new Map();
  try {
    const docs = await WineImage.find({ key: { $in: keys } }).select("key image").lean();
    byKey = new Map(docs.map((d) => [d.key, d.image]));
  } catch {
    return wines;
  }

  return wines.map((w) => {
    if (looksLikeImage(w.image)) return w;
    const img = byKey.get(wineKey(w.name, w.winery));
    return img ? { ...w, image: img, imageSource: "community" } : w;
  });
};

module.exports = { contribute, getImage, enrichWithImages, wineKey };
