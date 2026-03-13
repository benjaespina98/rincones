const placesService = require("../services/places.service");

const getPlaces = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius || 2500);
    const category = String(req.query.category || "all").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const result = await placesService.getNearbyPlaces({
      lat,
      lng,
      radius,
      category,
    });

    return res.status(200).json({
      data: result.places,
      meta: {
        source: result.source,
        radius,
        category,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getPlaces,
};