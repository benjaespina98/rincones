const mongoose = require("mongoose");
const Wine = require("../models/wine.model");
const WineMoment = require("../models/wineMoment.model");
const User = require("../models/user.model");
const ChangeLog = require("../models/changeLog.model");

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
  } = payload;

  const wine = new Wine({
    userId,
    name: String(name || "").trim(),
    winery: winery?.trim() || "",
    vintage: vintage ? parseInt(vintage) : null,
    region: region?.trim() || "",
    varietal: varietal?.trim() || "",
    notes: notes?.trim() || "",
    image: image || "",
    rawText: rawText || "",
    type: type || "unknown",
    rating: rating ? parseInt(rating) : 0,
    tasted: tasted === true,
    favorite: favorite === true,
    quantity: parseQuantity(quantity, 1),
    status: toWineStatus({ tasted: tasted === true, quantity: parseQuantity(quantity, 1), status }),
    lastConsumedAt: lastConsumedAt ? new Date(lastConsumedAt) : undefined,
    consumptionCount: parseQuantity(consumptionCount, 0),
  });

  const savedWine = await wine.save();

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
  getWineById,
  createWine,
  updateWine,
  adjustStock,
  getMoments,
  addMoment,
  deleteWine,
};
