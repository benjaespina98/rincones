const catalogService = require("../services/catalog.service");

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

module.exports = { search };
