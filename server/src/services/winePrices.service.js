// Precio comunitario de vinos: agrega lo que pagó la gente y devuelve promedio.

const WinePrice = require("../models/winePrice.model");

const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const wineKey = (name, winery) => {
  const n = fold(name);
  if (n.length < 3) return null;
  return `${n}|${fold(winery)}`;
};

// Suma un precio pagado al pool. Best-effort, nunca lanza.
const contribute = async ({ name, winery, price, currency = "ARS" }) => {
  try {
    const key = wineKey(name, winery);
    const value = Number(price);
    if (!key || !Number.isFinite(value) || value <= 0) return;

    const doc = await WinePrice.findOne({ key });
    if (!doc) {
      await WinePrice.create({
        key,
        sum: value,
        count: 1,
        currency,
        min: value,
        max: value,
        name: String(name || "").trim(),
        winery: String(winery || "").trim(),
      });
      return;
    }
    doc.sum += value;
    doc.count += 1;
    doc.min = doc.min == null ? value : Math.min(doc.min, value);
    doc.max = doc.max == null ? value : Math.max(doc.max, value);
    await doc.save();
  } catch {
    // El precio comunitario es una mejora, no un requisito.
  }
};

// Devuelve { avg, count, min, max, currency } o null si no hay datos.
const getPrice = async (name, winery) => {
  try {
    const key = wineKey(name, winery);
    if (!key) return null;
    const doc = await WinePrice.findOne({ key }).lean();
    if (!doc || doc.count < 1) return null;
    return {
      avg: Math.round(doc.sum / doc.count),
      count: doc.count,
      min: doc.min,
      max: doc.max,
      currency: doc.currency || "ARS",
    };
  } catch {
    return null;
  }
};

module.exports = { contribute, getPrice, wineKey };
