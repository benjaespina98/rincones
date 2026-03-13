import api from "./api";

export const discoverExternalPlaces = async ({
  query,
  categoria = "all",
  limit = 20,
  zona = "",
  radiusKm,
  lat,
  lng,
}) => {
  const { data } = await api.get("/geocode/discover", {
    params: {
      q: query,
      categoria,
      limit,
      zona,
      radiusKm,
      lat,
      lng,
    },
  });

  return {
    places: data.data || [],
    location: data.location || null,
    source: data.source || "",
    meta: data.meta || {},
  };
};

export const reverseDiscoverLocation = async ({ lat, lng }) => {
  const { data } = await api.get("/geocode/reverse", {
    params: {
      lat,
      lng,
    },
  });

  return data.data;
};

export const askDiscoverAssistant = async ({
  message,
  zona,
  categoria,
  lat,
  lng,
  radiusKm,
  candidates,
  context,
}) => {
  const { data } = await api.post("/geocode/chat", {
    message,
    zona,
    categoria,
    lat,
    lng,
    radiusKm,
    candidates,
    context,
  });

  return data.data || {};
};
