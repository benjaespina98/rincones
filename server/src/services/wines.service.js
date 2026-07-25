const mongoose = require("mongoose");
const Wine = require("../models/wine.model");
const { getCellarStatus } = require("./cellar.service");
const WineMoment = require("../models/wineMoment.model");
const User = require("../models/user.model");
const ChangeLog = require("../models/changeLog.model");
const wineImages = require("./wineImages.service");
const imageStorage = require("./imageStorage.service");
const winePrices = require("./winePrices.service");
const communityWines = require("./communityWines.service");

const logChange = async (actorUser, action, entityId, before, after) => {
  try {
    await ChangeLog.create({
      entityType: "wine",
      entityId,
      action,
      actor: { userId: actorUser._id, email: actorUser.email, role: actorUser.role },
      before,
      after,
    });
  } catch {
    // la auditoría nunca debe romper la operación principal
  }
};

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseQuantity = (value, fallback = 1) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toWineStatus = ({ tasted, quantity, status }) => {
  if (typeof status === "string" && status.trim()) return status.trim();
  if (Number(quantity) <= 0) return tasted ? "archived" : "stock";
  return tasted ? "tasted" : "stock";
};

async function listWines(userId) {
  return Wine.find({ userId }).sort({ createdAt: -1 }).select("-rawText");
}

async function searchWines(userId, query) {
  const safeQuery = escapeRegex(String(query || ""));
  const regex = new RegExp(safeQuery, "i");

  return Wine.find({
    userId,
    $or: [{ name: regex }, { winery: regex }, { region: regex }, { varietal: regex }, { notes: regex }],
  })
    .sort({ createdAt: -1 })
    .select("-rawText");
}

async function getStatsSummary(userId) {
  const wines = await Wine.find({ userId });

  const avgRating = wines.length > 0 ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1) : 0;

  return {
    totalWines: wines.length,
    tastedWines: wines.filter((w) => w.tasted).length,
    favoriteWines: wines.filter((w) => w.favorite).length,
    stockWines: wines.filter((w) => Number(w.quantity) > 0).length,
    averageRating: parseFloat(avgRating),
    byRating: {
      5: wines.filter((w) => w.rating === 5).length,
      4: wines.filter((w) => w.rating === 4).length,
      3: wines.filter((w) => w.rating === 3).length,
      2: wines.filter((w) => w.rating === 2).length,
      1: wines.filter((w) => w.rating === 1).length,
    },
  };
}

async function getWineById(userId, id) {
  return Wine.findOne({ _id: id, userId });
}

async function createWine(userId, payload) {
  const {
    name,
    winery,
    vintage,
    region,
    varietal,
    notes,
    image,
    rawText,
    rating,
    tasted,
    favorite,
    quantity,
    status,
    type,
    lastConsumedAt,
    consumptionCount,
    cellarLocation,
    drinkFrom,
    drinkUntil,
    price,
    currency,
    store,
    purchasedAt,
  } = payload;

  // Foto: si el usuario trae una, la usamos (y la aportamos al pool luego). Si
  // no, intentamos completar con la foto "stock" que otro haya subido del mismo
  // vino, para que la bodega no quede con placeholder cuando ya existe imagen.
  const rawProvided = wineImages.wineKey(name, winery) && /^(data:image\/|https?:\/\/)/.test(String(image || "").trim())
    ? String(image).trim()
    : "";
  // Subimos a Cloudinary (si está configurado) y guardamos la URL liviana; si no,
  // queda el base64 tal cual. Así el vino y el pool comparten la misma referencia.
  const providedImage = rawProvided ? await imageStorage.store(rawProvided) : "";
  const resolvedImage = providedImage || (await wineImages.getImage(name, winery));

  const wine = new Wine({
    userId,
    name: String(name || "").trim(),
    winery: winery?.trim() || "",
    vintage: vintage ? parseInt(vintage) : null,
    region: region?.trim() || "",
    varietal: varietal?.trim() || "",
    notes: notes?.trim() || "",
    image: resolvedImage,
    imageSource: providedImage ? undefined : (resolvedImage ? "community" : undefined),
    rawText: rawText || "",
    type: type || "unknown",
    rating: rating ? parseInt(rating) : 0,
    tasted: tasted === true,
    favorite: favorite === true,
    quantity: parseQuantity(quantity, 1),
    status: toWineStatus({ tasted: tasted === true, quantity: parseQuantity(quantity, 1), status }),
    lastConsumedAt: lastConsumedAt ? new Date(lastConsumedAt) : undefined,
    consumptionCount: parseQuantity(consumptionCount, 0),
    cellar: {
      location: cellarLocation?.trim() || undefined,
      drinkFrom: drinkFrom ? parseInt(drinkFrom) : undefined,
      drinkUntil: drinkUntil ? parseInt(drinkUntil) : undefined,
    },
    purchase: {
      price: price !== undefined && price !== "" ? parseFloat(price) : undefined,
      currency: currency || "ARS",
      store: store?.trim() || undefined,
      purchasedAt: purchasedAt ? new Date(purchasedAt) : undefined,
    },
  });

  const savedWine = await wine.save();

  // Si el usuario aportó una foto propia, la sumamos al pool compartido para
  // que aparezca cuando otro busque/cargue el mismo vino.
  if (providedImage) {
    await wineImages.contribute({ name, winery, image: providedImage, userId });
  }

  // Si registró lo que pagó, alimenta el precio comunitario (promedio).
  if (savedWine.purchase?.price > 0) {
    await winePrices.contribute({
      name, winery,
      price: savedWine.purchase.price,
      currency: savedWine.purchase.currency,
    });
  }

  // La identidad del vino alimenta el catálogo comunitario (búsqueda de todos).
  await communityWines.contribute({
    name: savedWine.name,
    winery: savedWine.winery,
    region: savedWine.region,
    varietal: savedWine.varietal,
    type: savedWine.type,
    image: resolvedImage,
  });

  const user = await User.findById(userId);
  user.stats.winesCount = (user.stats.winesCount || 0) + 1;
  if (tasted) user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
  await user.save();

  await logChange(user, "create", savedWine._id, null, { name: savedWine.name, winery: savedWine.winery });

  return savedWine;
}

async function updateWine(userId, id, payload) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const beforeSnapshot = { name: wine.name, winery: wine.winery };

  const {
    name,
    winery,
    vintage,
    region,
    varietal,
    notes,
    rating,
    tasted,
    favorite,
    quantity,
    status,
    type,
    lastConsumedAt,
    consumptionCount,
    cellarLocation,
    drinkFrom,
    drinkUntil,
    price,
    currency,
    store,
    purchasedAt,
  } = payload;

  if (name !== undefined) wine.name = String(name).trim();
  if (winery !== undefined) wine.winery = String(winery).trim();
  if (vintage !== undefined) wine.vintage = vintage ? parseInt(vintage) : null;
  if (region !== undefined) wine.region = String(region).trim();
  if (varietal !== undefined) wine.varietal = String(varietal).trim();
  if (notes !== undefined) wine.notes = String(notes).trim();
  if (type !== undefined) wine.type = type;
  if (rating !== undefined) wine.rating = parseInt(rating);
  if (favorite !== undefined) wine.favorite = favorite === true;
  if (quantity !== undefined) wine.quantity = parseQuantity(quantity, wine.quantity);
  if (status !== undefined) wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity, status });
  if (lastConsumedAt !== undefined) wine.lastConsumedAt = lastConsumedAt ? new Date(lastConsumedAt) : null;
  if (consumptionCount !== undefined) wine.consumptionCount = parseQuantity(consumptionCount, wine.consumptionCount || 0);

  if (cellarLocation !== undefined) wine.cellar = { ...wine.cellar, location: cellarLocation?.trim() || undefined };
  if (drinkFrom !== undefined) wine.cellar = { ...wine.cellar, drinkFrom: drinkFrom ? parseInt(drinkFrom) : undefined };
  if (drinkUntil !== undefined) wine.cellar = { ...wine.cellar, drinkUntil: drinkUntil ? parseInt(drinkUntil) : undefined };
  if (price !== undefined) wine.purchase = { ...wine.purchase, price: price !== "" ? parseFloat(price) : undefined };
  if (currency !== undefined) wine.purchase = { ...wine.purchase, currency };
  if (store !== undefined) wine.purchase = { ...wine.purchase, store: store?.trim() || undefined };
  if (purchasedAt !== undefined) wine.purchase = { ...wine.purchase, purchasedAt: purchasedAt ? new Date(purchasedAt) : null };

  const wasTasted = wine.tasted;
  if (tasted !== undefined) wine.tasted = tasted === true;
  wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity, status: wine.status });

  wine.updatedAt = new Date();
  const updatedWine = await wine.save();

  const user = await User.findById(userId);
  if (wasTasted !== updatedWine.tasted) {
    if (updatedWine.tasted) user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
    else user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
    await user.save();
  }

  await logChange(user, "update", updatedWine._id, beforeSnapshot, {
    name: updatedWine.name,
    winery: updatedWine.winery,
  });

  return updatedWine;
}

async function adjustStock(userId, id, { delta, quantity }) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const nextQuantity = quantity !== undefined ? parseQuantity(quantity, wine.quantity) : Math.max(0, Number(wine.quantity || 0) + Number(delta || 0));
  wine.quantity = nextQuantity;
  wine.status = toWineStatus({ tasted: wine.tasted, quantity: nextQuantity, status: wine.status });
  wine.updatedAt = new Date();

  const updatedWine = await wine.save();
  return updatedWine;
}

async function getMoments(userId, id) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const moments = await WineMoment.find({ wineId: wine._id, userId }).sort({ consumedAt: -1 });
  return moments;
}

async function addMoment(userId, id, body) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const moment = await WineMoment.create({
    userId,
    wineId: wine._id,
    consumedAt: body.consumedAt ? new Date(body.consumedAt) : new Date(),
    occasion: String(body.occasion || "").trim(),
    companions: String(body.companions || "").trim(),
    place: String(body.place || "").trim(),
    emotion: String(body.emotion || "").trim(),
    foodPairing: String(body.foodPairing || "").trim(),
    notes: String(body.notes || "").trim(),
    rating: body.rating !== undefined ? Number(body.rating) : wine.rating,
    photo: String(body.photo || "").trim(),
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean).map((t) => String(t).trim()) : [],
  });

  const wasTasted = wine.tasted;
  wine.consumptionCount = Number(wine.consumptionCount || 0) + 1;
  wine.lastConsumedAt = moment.consumedAt;
  wine.tasted = true;
  wine.status = toWineStatus({ tasted: true, quantity: wine.quantity, status: wine.status });
  await wine.save();

  if (!wasTasted) {
    const user = await User.findById(userId);
    user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
    await user.save();
  }

  return moment;
}

async function getSpendingStats(userId) {
  const ObjectId = mongoose.Types.ObjectId;
  const userObjectId = new ObjectId(userId);

  const agg = await Wine.aggregate([
    { $match: { userId: userObjectId, "purchase.price": { $exists: true, $gt: 0 } } },
    {
      $facet: {
        total: [
          { $group: { _id: null, totalSpent: { $sum: "$purchase.price" }, count: { $sum: 1 } } },
        ],
        byMonth: [
          { $match: { "purchase.purchasedAt": { $exists: true } } },
          {
            $group: {
              _id: {
                year:  { $year: "$purchase.purchasedAt" },
                month: { $month: "$purchase.purchasedAt" },
              },
              total: { $sum: "$purchase.price" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1 } },
          { $limit: 12 },
        ],
        byType: [
          {
            $group: {
              _id: "$type",
              avgPrice: { $avg: "$purchase.price" },
              count:    { $sum: 1 },
            },
          },
          { $sort: { avgPrice: -1 } },
        ],
        bestValue: [
          { $match: { rating: { $gt: 0 } } },
          {
            $addFields: {
              valueScore: { $divide: ["$rating", { $add: ["$purchase.price", 1] }] },
            },
          },
          { $sort: { valueScore: -1 } },
          { $limit: 1 },
          { $project: { name: 1, winery: 1, rating: 1, "purchase.price": 1 } },
        ],
      },
    },
  ]).exec();

  const out = agg && agg[0] ? agg[0] : {};
  const totalRow = out.total && out.total[0];

  return {
    totalSpent:    totalRow ? totalRow.totalSpent : 0,
    winesWithPrice: totalRow ? totalRow.count : 0,
    byMonth: (out.byMonth || []).map((r) => ({
      year:  r._id.year,
      month: r._id.month,
      total: r.total,
      count: r.count,
    })),
    avgPriceByType: (out.byType || []).map((r) => ({
      type:     r._id || "unknown",
      avgPrice: Math.round(r.avgPrice),
      count:    r.count,
    })),
    bestValueWine: out.bestValue && out.bestValue[0] ? out.bestValue[0] : null,
  };
}

const FOOD_PAIRINGS = {
  asado:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Bonarda", "Tannat", "Petit Verdot"] },
  carne:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Tannat", "Petit Verdot"] },
  pollo:    { types: ["white", "red"],              varietals: ["Chardonnay", "Pinot Noir", "Torrontés", "Viognier"] },
  pasta:    { types: ["red", "white"],              varietals: ["Merlot", "Bonarda", "Chardonnay", "Pinot Noir", "Sangiovese"] },
  pizza:    { types: ["red"],                       varietals: ["Bonarda", "Sangiovese", "Malbec", "Tempranillo"] },
  pescado:  { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Torrontés", "Chardonnay", "Pinot Grigio", "Viognier"] },
  mariscos: { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Chardonnay", "Pinot Grigio", "Albariño"] },
  picada:   { types: ["red", "white"],              varietals: ["Malbec", "Bonarda", "Torrontés", "Chardonnay"] },
  queso:    { types: ["red", "white", "fortified"], varietals: ["Malbec", "Chardonnay", "Sémillon", "Gewürztraminer"] },
  ensalada: { types: ["white", "rosé", "sparkling"],varietals: ["Sauvignon Blanc", "Torrontés", "Pinot Grigio"] },
  postre:   { types: ["sparkling", "fortified"],    varietals: ["Torrontés", "Gewürztraminer", "Chenin Blanc", "Moscato"] },
  solo:     { types: [],                            varietals: [] },
};

function daysSince(date) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function scoreWine(wine, context) {
  let score = 0;
  const reasons = [];

  // Rating del usuario (máx 30)
  if (wine.rating > 0) {
    score += wine.rating * 6;
    reasons.push(`${wine.rating}★`);
  }

  // Favorito
  if (wine.favorite) {
    score += 10;
    reasons.push("Favorito");
  }

  const pairing = context.food ? FOOD_PAIRINGS[context.food] : null;

  // Maridaje — tipo
  if (pairing && pairing.types.length > 0 && pairing.types.includes(wine.type)) {
    score += 20;
  }

  // Maridaje — varietal
  if (pairing && wine.varietal) {
    const match = pairing.varietals.some((v) =>
      wine.varietal.toLowerCase().includes(v.toLowerCase())
    );
    if (match) {
      score += 15;
      reasons.push("Maridaría bien");
    }
  }

  // Estilo buscado (refina; la comida es el driver principal).
  const m = context.mood;
  if (m === "liviano" && ["white", "sparkling", "rosé"].includes(wine.type)) score += 12;
  if (m === "cuerpo" && ["red", "fortified"].includes(wine.type)) score += 12;
  if (m === "festivo" && wine.type === "sparkling") score += 15;

  // Novedad — bonus si nunca fue probado
  if (!wine.tasted) score += 5;

  // Penalización por consumo reciente
  if (wine.lastConsumedAt && daysSince(wine.lastConsumedAt) < 7) score -= 10;

  // Ventana óptima
  const cellar = getCellarStatus(wine);
  if (cellar.status === "peak") {
    score += 10;
    reasons.push("Momento óptimo");
  }

  return { score, reasons };
}

async function suggestWines(userId, context = {}) {
  const wines = await Wine.find({ userId, quantity: { $gt: 0 } }).select("-rawText");

  const scored = wines
    .map((wine) => {
      const { score, reasons } = scoreWine(wine, context);
      return { wine, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ wine, score, reasons }) => ({
    ...wine.toObject(),
    matchScore: score,
    matchReason: reasons.join(" · ") || "Disponible en tu bodega",
  }));
}

async function getCellarReady(userId) {
  const wines = await Wine.find({ userId, quantity: { $gt: 0 } }).select("-rawText");
  return wines
    .filter((w) => getCellarStatus(w).status === "peak")
    .map((w) => ({ ...w.toObject(), cellarStatus: getCellarStatus(w) }));
}

async function deleteWine(userId, id) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const user = await User.findById(userId);
  user.stats.winesCount = Math.max(0, (user.stats.winesCount || 0) - 1);
  if (wine.tasted) user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
  await user.save();

  await Wine.deleteOne({ _id: id, userId });
  await logChange(user, "delete", wine._id, { name: wine.name, winery: wine.winery }, null);
  return true;
}

module.exports = {
  listWines,
  searchWines,
  getStatsSummary,
  getSpendingStats,
  getWineById,
  createWine,
  updateWine,
  adjustStock,
  getMoments,
  addMoment,
  deleteWine,
  suggestWines,
  getCellarReady,
};
