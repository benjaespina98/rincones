const WineWish = require("../models/wineWish.model");
const winesService = require("./wines.service");

async function listWishes(userId) {
  return WineWish.find({ userId }).sort({ addedAt: -1 });
}

async function createWish(userId, payload) {
  const { name, winery, type, region, varietal, vintage, notes, source, priority } = payload;

  return WineWish.create({
    userId,
    name: String(name || "").trim(),
    winery: winery?.trim() || "",
    type: type || "unknown",
    region: region?.trim() || "",
    varietal: varietal?.trim() || "",
    vintage: vintage ? parseInt(vintage) : undefined,
    notes: notes?.trim() || "",
    source: source || "manual",
    priority: priority ? parseInt(priority) : 2,
  });
}

async function deleteWish(userId, id) {
  const wish = await WineWish.findOne({ _id: id, userId });
  if (!wish) return null;
  await WineWish.deleteOne({ _id: id, userId });
  return true;
}

async function convertWishToWine(userId, id, purchaseData = {}) {
  const wish = await WineWish.findOne({ _id: id, userId });
  if (!wish) return null;

  const wine = await winesService.createWine(userId, {
    name: wish.name,
    winery: wish.winery,
    type: wish.type,
    region: wish.region,
    varietal: wish.varietal,
    vintage: wish.vintage,
    notes: wish.notes,
    quantity: purchaseData.quantity || 1,
    price: purchaseData.price,
    store: purchaseData.store,
    purchasedAt: purchaseData.purchasedAt,
    currency: purchaseData.currency || "ARS",
  });

  await WineWish.deleteOne({ _id: id, userId });
  return wine;
}

module.exports = { listWishes, createWish, deleteWish, convertWishToWine };
