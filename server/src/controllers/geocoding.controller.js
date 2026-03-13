const geocodingService = require("../services/geocoding.service");
const discoverAssistantService = require("../services/discoverAssistant.service");

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
      source: "Fuentes publicas combinadas",
      meta: result.meta || {},
    });
  } catch (error) {
    return next(error);
  }
};

const askDiscoverAssistant = async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    const zona = String(req.body?.zona || "").trim();
    const categoria = String(req.body?.categoria || "all").trim();
    const radiusKm = Number(req.body?.radiusKm);
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
    const contextPayload = req.body?.context && typeof req.body.context === "object" ? req.body.context : {};
    const context = {
      recentQueries: Array.isArray(contextPayload.recentQueries)
        ? contextPayload.recentQueries.map((item) => String(item || "").trim()).filter(Boolean).slice(-6)
        : [],
      previousSummary: String(contextPayload.previousSummary || "").trim().slice(0, 500),
      previousPickIds: Array.isArray(contextPayload.previousPickIds)
        ? contextPayload.previousPickIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
        : [],
      locationMode: String(contextPayload.locationMode || "").trim().slice(0, 30),
      locationLabel: String(contextPayload.locationLabel || "").trim().slice(0, 140),
      discoverSources: Array.isArray(contextPayload.discoverSources)
        ? contextPayload.discoverSources.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
    };

    const result = await discoverAssistantService.askDiscoverAssistant({
      message,
      zona,
      categoria,
      lat,
      lng,
      radiusKm,
      candidates,
      context,
    });

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCoordinates,
  getReverseCoordinates,
  discoverPlaces,
  askDiscoverAssistant,
};
