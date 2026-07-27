import api from "./api";

/**
 * Reseñas públicas de un vino.
 * Devuelve { summary: {avg, count} | null, mine: review | null, reviews: [] }.
 */
export const getWineReviews = async (name, winery = "") => {
  const { data } = await api.get("/catalog/reviews", { params: { name, winery } });
  return data?.data || { summary: null, mine: null, reviews: [] };
};

/** Publica (o edita) tu reseña. Esto es lo que la vuelve pública. */
export const publishWineReview = async ({ name, winery, rating, text }) => {
  const { data } = await api.post("/catalog/reviews", { name, winery, rating, text });
  return data?.data || null;
};

/** Borra tu reseña: deja de aparecer para el resto. */
export const deleteWineReview = async (name, winery = "") => {
  const { data } = await api.delete("/catalog/reviews", { params: { name, winery } });
  return data;
};
