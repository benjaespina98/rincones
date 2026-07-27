// Reseñas comunitarias de vinos.
//
// Mismo espíritu que winePrices/wineImages: un pool compartido por vino
// (nombre + bodega normalizados). La diferencia es que acá guardamos cada
// reseña individual, no un agregado, porque el texto y el autor se muestran.

const WineReview = require("../models/wineReview.model");

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

/**
 * Publica (o edita) la reseña del usuario para un vino.
 * Una por persona por vino: volver a publicar reemplaza la anterior.
 */
const upsertReview = async ({ userId, name, winery, rating, text, author }) => {
  const key = wineKey(name, winery);
  if (!key) throw new Error("Faltan datos del vino");

  const value = Number(rating);
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    throw new Error("La puntuación tiene que ser de 1 a 5");
  }

  const doc = await WineReview.findOneAndUpdate(
    { key, userId },
    {
      $set: {
        key,
        userId,
        rating: Math.round(value),
        text: String(text || "").trim().slice(0, 1000),
        authorName: String(author?.name || "").trim(),
        authorAvatar: String(author?.avatar || "").trim(),
        name: String(name || "").trim(),
        winery: String(winery || "").trim(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
};

const deleteReview = async ({ userId, name, winery }) => {
  const key = wineKey(name, winery);
  if (!key) return false;
  const res = await WineReview.deleteOne({ key, userId });
  return res.deletedCount > 0;
};

/**
 * Reseñas de un vino + resumen. `userId` sirve para separar la propia del
 * resto, así el cliente puede mostrarla como editable.
 */
const listReviews = async (name, winery, userId, limit = 20) => {
  const key = wineKey(name, winery);
  if (!key) return { summary: null, mine: null, reviews: [] };

  try {
    const docs = await WineReview.find({ key })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const all = await WineReview.aggregate([
      { $match: { key } },
      { $group: { _id: "$key", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    const agg = all[0];
    const summary = agg ? { avg: Math.round(agg.avg * 10) / 10, count: agg.count } : null;

    const uid = String(userId || "");
    const mine = docs.find((d) => String(d.userId) === uid) || null;
    const reviews = docs.filter((d) => String(d.userId) !== uid);

    return { summary, mine, reviews };
  } catch {
    return { summary: null, mine: null, reviews: [] };
  }
};

/**
 * Promedios para muchos vinos de una sola consulta. Lo usa la búsqueda para
 * poder mostrar estrellas en las tarjetas sin pegarle a la base por resultado.
 * Devuelve un Map keyed por `wineKey`.
 */
const getSummaries = async (wines = []) => {
  const keys = [...new Set(wines.map((w) => wineKey(w.name, w.winery)).filter(Boolean))];
  if (keys.length === 0) return new Map();

  try {
    const rows = await WineReview.aggregate([
      { $match: { key: { $in: keys } } },
      { $group: { _id: "$key", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    return new Map(
      rows.map((r) => [r._id, { avg: Math.round(r.avg * 10) / 10, count: r.count }])
    );
  } catch {
    // Las reseñas son un extra: si fallan, la búsqueda sigue funcionando.
    return new Map();
  }
};

module.exports = { upsertReview, deleteReview, listReviews, getSummaries, wineKey };
