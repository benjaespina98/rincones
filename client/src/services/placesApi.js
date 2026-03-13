import api from "./api";

export const getNearbyPlaces = async ({ lat, lng, radius = 2500, category = "all" }) => {
  const { data } = await api.get("/places", {
    timeout: 20000,
    params: {
      lat,
      lng,
      radius,
      category,
    },
  });

  return {
    places: data.data || [],
    meta: data.meta || {},
  };
};