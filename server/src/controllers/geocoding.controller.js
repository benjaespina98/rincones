const geocodingService = require("../services/geocoding.service");

const getCoordinates = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();

    if (query.length < 3) {
      return res.status(400).json({ message: "La busqueda debe tener al menos 3 caracteres" });
    }

    const result = await geocodingService.searchLocation(query);

    if (!result) {
      return res.status(404).json({ message: "No se encontraron resultados" });
    }

    return res.status(200).json({
      data: result.data,
      suggestions: result.suggestions,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCoordinates,
};
