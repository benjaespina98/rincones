import api from "./api";

/**
 * Reseñas públicas de un vino.
 * Devuelve { summary: {avg, count} | null, mine: review | null, reviews: [] }.
 *
 * La uva va en las tres llamadas y no es opcional de verdad: es parte de la
 * identidad del vino. Sin ella, "Rutini" (como se llama en tu bodega) y "Rutini
 * Malbec" (como lo devuelve el catálogo) eran dos vinos distintos para las
 * reseñas, y tu propia puntuación no aparecía en tu propia ficha.
 */
export const getWineReviews = async (name, winery = "", varietal = "") => {
  const { data } = await api.get("/catalog/reviews", { params: { name, winery, varietal } });
  return data?.data || { summary: null, mine: null, reviews: [] };
};

/** Tus reseñas, de la más reciente a la más vieja. Para el perfil. */
export const getMyReviews = async () => {
  const { data } = await api.get("/catalog/reviews/mine");
  return Array.isArray(data?.data) ? data.data : [];
};

/** Publica (o edita) tu reseña. Esto es lo que la vuelve pública. */
export const publishWineReview = async ({ name, winery, varietal, rating, text }) => {
  const { data } = await api.post("/catalog/reviews", { name, winery, varietal, rating, text });
  return data?.data || null;
};

/** Borra tu reseña: deja de aparecer para el resto. */
export const deleteWineReview = async (name, winery = "", varietal = "") => {
  const { data } = await api.delete("/catalog/reviews", { params: { name, winery, varietal } });
  return data;
};
