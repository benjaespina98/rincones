const searchLocation = async (query) => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(`${query}, Argentina`)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "rincones-app/1.0 (geocoding-service)",
    },
  });

  if (!response.ok) {
    const error = new Error("No se pudo consultar el servicio de geocodificacion");
    error.statusCode = 502;
    throw error;
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const suggestions = results
    .map((item) => ({
      latitud: Number(item.lat),
      longitud: Number(item.lon),
      nombre: item.display_name,
    }))
    .filter((item) => Number.isFinite(item.latitud) && Number.isFinite(item.longitud));

  if (suggestions.length === 0) {
    return null;
  }

  return {
    data: suggestions[0],
    suggestions,
  };
};

module.exports = {
  searchLocation,
};
