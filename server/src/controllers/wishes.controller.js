const wishesService = require("../services/wishes.service");

const list = async (req, res) => {
  try {
    const wishes = await wishesService.listWishes(req.user.id);
    return res.json({ success: true, data: wishes, count: wishes.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || String(name).trim() === "") {
      return res.status(400).json({ success: false, error: "El nombre del vino es obligatorio" });
    }
    const wish = await wishesService.createWish(req.user.id, req.body);
    return res.status(201).json({ success: true, data: wish });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const update = async (req, res) => {
  try {
    const wish = await wishesService.updateWish(req.user.id, req.params.id, req.body);
    if (!wish) return res.status(404).json({ success: false, error: "Vino no encontrado en la lista" });
    return res.json({ success: true, data: wish });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const ok = await wishesService.deleteWish(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Vino no encontrado en la lista" });
    return res.json({ success: true, message: "Eliminado de la lista de deseos" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const convert = async (req, res) => {
  try {
    const wine = await wishesService.convertWishToWine(req.user.id, req.params.id, req.body);
    if (!wine) return res.status(404).json({ success: false, error: "Vino no encontrado en la lista" });
    return res.status(201).json({ success: true, data: wine });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { list, create, update, remove, convert };
