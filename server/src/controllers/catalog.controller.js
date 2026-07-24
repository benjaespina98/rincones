const catalogService = require("../services/catalog.service");
const { describeWine } = require("../services/wineAi.service");
const WineInfo = require("../models/wineInfo.model");

// GET /api/catalog/search?q=...
const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ data: [], degraded: false });
    }

    const { results, degraded } = await catalogService.searchWines(q);
    return res.status(200).json({ data: results, degraded });
  } catch (error) {
    return next(error);
  }
};

const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// POST /api/catalog/describe { name, winery, varietal, type, region, vintage }
// Devuelve la ficha (estilo Vivino) del vino, generada por Gemini y cacheada.
const describe = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }
    const winery = String(req.body.winery || "").trim();
    const key = `${fold(name)}|${fold(winery)}`;

    // Cache compartida primero.
    try {
      const cached = await WineInfo.findOne({ key }).lean();
      if (cached?.info) return res.status(200).json({ data: cached.info, cached: true });
    } catch {
      // Sin cache: seguimos y generamos.
    }

    const info = await describeWine({
      name,
      winery,
      varietal: String(req.body.varietal || "").trim(),
      type: String(req.body.type || "").trim(),
      region: String(req.body.region || "").trim(),
      vintage: req.body.vintage,
    });

    if (!info) {
      return res.status(503).json({ message: "No pudimos generar la descripción ahora" });
    }

    try {
      await WineInfo.updateOne({ key }, { $set: { key, info } }, { upsert: true });
    } catch {
      // El cache es una optimización; devolvemos igual.
    }

    return res.status(200).json({ data: info, cached: false });
  } catch (error) {
    return next(error);
  }
};

// GET /api/catalog/featured - vinos destacados para la home Descubrí.
const featured = async (req, res, next) => {
  try {
    const data = catalogService.getFeatured(8);
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { search, describe, featured };
