const WineWish = require("../models/wineWish.model");
const { esImagenAceptada } = require("../utils/imagenAceptada");

async function listWishes(userId) {
  return WineWish.find({ userId }).sort({ addedAt: -1 });
}

async function createWish(userId, payload) {
  const { name, winery, type, region, varietal, vintage, notes, source, priority, image, favorite } = payload;
  const cleanName = String(name || "").trim();
  const cleanWinery = winery?.trim() || "";
  // Sólo data:image y https: lo demás (javascript:, http:, file:) se descarta.
  const cleanImage = esImagenAceptada(image) ? String(image).trim() : "";

  // Evitar duplicados: si ya está guardado el mismo vino, actualizamos datos que
  // falten (foto, favorito) en vez de crear otra fila.
  const existing = await WineWish.findOne({
    userId,
    name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    winery: new RegExp(`^${cleanWinery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (existing) {
    if (cleanImage && !existing.image) existing.image = cleanImage;
    if (favorite) existing.favorite = true;
    if (varietal && !existing.varietal) existing.varietal = varietal.trim();
    if (region && !existing.region) existing.region = region.trim();
    await existing.save();
    return existing;
  }

  return WineWish.create({
    userId,
    name: cleanName,
    winery: cleanWinery,
    type: type || "unknown",
    region: region?.trim() || "",
    varietal: varietal?.trim() || "",
    vintage: vintage ? parseInt(vintage) : undefined,
    notes: notes?.trim() || "",
    image: cleanImage,
    favorite: Boolean(favorite),
    source: source || "manual",
    priority: priority ? parseInt(priority) : 2,
  });
}

async function updateWish(userId, id, patch = {}) {
  const wish = await WineWish.findOne({ _id: id, userId });
  if (!wish) return null;
  if (typeof patch.favorite === "boolean") wish.favorite = patch.favorite;
  if (typeof patch.notes === "string") wish.notes = patch.notes.trim().slice(0, 2000);
  if (patch.priority) wish.priority = parseInt(patch.priority);
  await wish.save();
  return wish;
}

async function deleteWish(userId, id) {
  const wish = await WineWish.findOne({ _id: id, userId });
  if (!wish) return null;
  await WineWish.deleteOne({ _id: id, userId });
  return true;
}

module.exports = { listWishes, createWish, updateWish, deleteWish };
