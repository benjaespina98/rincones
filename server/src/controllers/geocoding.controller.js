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

const getReverseCoordinates = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Latitud y longitud inválidas" });
    }

    const data = await geocodingService.reverseLocation({ lat, lng });
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

const discoverPlaces = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    const zona = String(req.query.zona || "").trim();
    const categoria = String(req.query.categoria || "all").trim();
    const limit = Number(req.query.limit || 20);
    const radiusKm = Number(req.query.radiusKm);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (!hasCoords && zona.length < 3) {
      return res.status(400).json({ message: "Indicá una zona (mínimo 3 caracteres) o activá ubicación actual" });
    }

    if (query.length > 0 && query.length < 2) {
      return res.status(400).json({ message: "La búsqueda debe tener al menos 2 caracteres" });
    }

    const result = await geocodingService.discoverPlaces({
      query,
      zona,
      categoria,
      limit,
      radiusKm,
      lat,
      lng,
    });

    return res.status(200).json({
      data: result.results,
      location: result.location,
      source: "OpenStreetMap/Overpass",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCoordinates,
  getReverseCoordinates,
  discoverPlaces,
};
