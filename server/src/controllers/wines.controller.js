const winesService = require("../services/wines.service");

const list = async (req, res) => {
  try {
    const wines = await winesService.listWines(req.user.id);
    return res.json({ success: true, data: wines, count: wines.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const search = async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || "").trim();
    if (!query) return res.json({ success: true, data: [], count: 0 });
    const wines = await winesService.searchWines(req.user.id, query);
    return res.json({ success: true, data: wines, count: wines.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const statsSummary = async (req, res) => {
  try {
    const summary = await winesService.getStatsSummary(req.user.id);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const wine = await winesService.getWineById(req.user.id, req.params.id);
    if (!wine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: wine });
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

    const savedWine = await winesService.createWine(req.user.id, req.body);
    return res.status(201).json({ success: true, data: savedWine });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const update = async (req, res) => {
  try {
    const updatedWine = await winesService.updateWine(req.user.id, req.params.id, req.body);
    if (!updatedWine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: updatedWine });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const adjustStock = async (req, res) => {
  try {
    const updatedWine = await winesService.adjustStock(req.user.id, req.params.id, req.body);
    if (!updatedWine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: updatedWine });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getMoments = async (req, res) => {
  try {
    const moments = await winesService.getMoments(req.user.id, req.params.id);
    if (moments === null) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: moments, count: moments.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const addMoment = async (req, res) => {
  try {
    const moment = await winesService.addMoment(req.user.id, req.params.id, req.body);
    if (!moment) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.status(201).json({ success: true, data: moment });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const ok = await winesService.deleteWine(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, message: "Vino eliminado" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  list,
  search,
  statsSummary,
  getOne,
  create,
  update,
  adjustStock,
  getMoments,
  addMoment,
  remove,
};
