const winesService = require("../services/wines.service");
const { fail } = require("../utils/apiError");

const list = async (req, res) => {
  try {
    const wines = await winesService.listWines(req.user.id);
    return res.json({ success: true, data: wines, count: wines.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const search = async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || "").trim();
    if (!query) return res.json({ success: true, data: [], count: 0 });
    const wines = await winesService.searchWines(req.user.id, query);
    return res.json({ success: true, data: wines, count: wines.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const statsSummary = async (req, res) => {
  try {
    const summary = await winesService.getStatsSummary(req.user.id);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return fail(res, error, req);
  }
};

const getOne = async (req, res) => {
  try {
    const wine = await winesService.getWineById(req.user.id, req.params.id);
    if (!wine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: wine });
  } catch (error) {
    return fail(res, error, req);
  }
};

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || String(name).trim() === "") {
      return res.status(400).json({ success: false, error: "El nombre del vino es obligatorio" });
    }

    const { wine, merged, added } = await winesService.createWine(req.user.id, req.body);
    // 200 y no 201 cuando fue una reposición: no se creó un recurso nuevo. El
    // cliente lo usa para decir "sumamos 1, ahora tenés 3" en vez de "agregado".
    return res.status(merged ? 200 : 201).json({ success: true, data: wine, merged, added });
  } catch (error) {
    return fail(res, error, req);
  }
};

const update = async (req, res) => {
  try {
    const updatedWine = await winesService.updateWine(req.user.id, req.params.id, req.body);
    if (!updatedWine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: updatedWine });
  } catch (error) {
    return fail(res, error, req);
  }
};

const adjustStock = async (req, res) => {
  try {
    const updatedWine = await winesService.adjustStock(req.user.id, req.params.id, req.body);
    if (!updatedWine) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: updatedWine });
  } catch (error) {
    return fail(res, error, req);
  }
};

const getMoments = async (req, res) => {
  try {
    const moments = await winesService.getMoments(req.user.id, req.params.id);
    if (moments === null) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, data: moments, count: moments.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

// GET /api/wines/moments - tu diario completo, de todos tus vinos.
const getAllMoments = async (req, res) => {
  try {
    const moments = await winesService.getAllMoments(req.user.id, { limit: req.query.limit });
    return res.json({ success: true, data: moments, count: moments.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const addMoment = async (req, res) => {
  try {
    const moment = await winesService.addMoment(req.user.id, req.params.id, req.body);
    if (!moment) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.status(201).json({ success: true, data: moment });
  } catch (error) {
    return fail(res, error, req);
  }
};

const spendingStats = async (req, res) => {
  try {
    const data = await winesService.getSpendingStats(req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error, req);
  }
};

const suggest = async (req, res) => {
  try {
    const { food, mood, maxResults } = req.body;
    const results = await winesService.suggestWines(req.user.id, { food, mood, maxResults });
    return res.json({ success: true, data: results, count: results.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const cellarReady = async (req, res) => {
  try {
    const wines = await winesService.getCellarReady(req.user.id);
    return res.json({ success: true, data: wines, count: wines.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const remove = async (req, res) => {
  try {
    // Cuántos momentos quedan en el diario después de borrar el vino. Se cuenta
    // ANTES porque después el vino ya no está, y es lo que le permite a la ficha
    // decir qué se conservó en vez de dejar una duda.
    const momentos = await winesService.countMoments(req.user.id, req.params.id);
    const ok = await winesService.deleteWine(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Vino no encontrado" });
    return res.json({ success: true, message: "Vino eliminado", moments: momentos });
  } catch (error) {
    return fail(res, error, req);
  }
};

/**
 * Varios vinos, una acción, una petición. Ver `bulkAction` en el servicio.
 *
 * Devuelve cuántos cambiaron de verdad, no cuántos se mandaron: si alguno ya
 * estaba como se pedía, o se borró en otra pestaña, el número que ve el usuario
 * tiene que ser el real.
 */
const bulk = async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    const resultado = await winesService.bulkAction(req.user.id, ids, action);
    if (!resultado) return res.status(400).json({ success: false, error: "Acción no válida" });
    return res.json({ success: true, data: resultado });
  } catch (error) {
    return fail(res, error, req);
  }
};

module.exports = {
  list,
  search,
  statsSummary,
  spendingStats,
  suggest,
  cellarReady,
  getOne,
  create,
  update,
  adjustStock,
  getMoments,
  getAllMoments,
  addMoment,
  remove,
  bulk,
};
