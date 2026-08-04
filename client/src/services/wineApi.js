import api from "./api";

export const getWines = async () => {
  const { data } = await api.get("/wines");
  return data.data || [];
};

export const getWineById = async (id) => {
  const { data } = await api.get(`/wines/${id}`);
  return data.data;
};

export const createWine = async (payload) => {
  const { data } = await api.post("/wines", payload);
  return data.data;
};

export const updateWine = async (id, payload) => {
  const { data } = await api.put(`/wines/${id}`, payload);
  return data.data;
};

export const deleteWine = async (id) => {
  const { data } = await api.delete(`/wines/${id}`);
  return data;
};

export const adjustWineStock = async (id, delta, extra = {}) => {
  const { data } = await api.patch(`/wines/${id}/stock`, { delta, ...extra });
  return data.data;
};

/**
 * Abrir una botella: la descuenta del stock y deja el vino marcado como
 * probado, en una sola operación. Descontar con "−" a secas NO marca probado:
 * también se saca una botella para regalarla o para corregir un número.
 */
export const openBottle = async (id) => adjustWineStock(id, -1, { markTasted: true });

/**
 * Deshacer lo anterior. `wasTasted` es cómo estaba el vino ANTES de abrir: si ya
 * lo habías probado, deshacer no puede borrarte ese dato.
 */
export const undoOpenBottle = async (id, wasTasted) =>
  adjustWineStock(id, 1, { undoOpen: true, wasTasted: wasTasted === true });

export const getWineStats = async () => {
  const { data } = await api.get("/wines/stats/summary");
  return data.data;
};

export const searchWines = async (query) => {
  const { data } = await api.get("/wines/search", {
    params: { q: query },
  });

  return data.data || [];
};

export const getWineSuggestions = async () => {
  const wines = await getWines();

  return [...wines]
    .sort((a, b) => {
      const ratingDelta = Number(b.rating || 0) - Number(a.rating || 0);
      if (ratingDelta !== 0) return ratingDelta;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, 6)
    .map((wine) => ({
      ...wine,
      reason: wine.favorite
        ? "Basado en tus favoritos"
        : wine.tasted
          ? "Similar a vinos que ya tomaste"
          : "Sugerencia según tu bodega",
    }));
};

export const toggleWineFavorite = async (id, isFavorite) => {
  return updateWine(id, { favorite: isFavorite });
};

export const toggleWineTasted = async (id, isTasted) => {
  return updateWine(id, { tasted: isTasted });
};

export const getSpendingStats = async () => {
  const { data } = await api.get("/wines/stats/spending");
  return data.data;
};

export const getSuggestedWines = async (context = {}) => {
  const { data } = await api.post("/wines/suggest", context);
  return data.data || [];
};

export const getWineMoments = async (id) => {
  const { data } = await api.get(`/wines/${id}/moments`);
  return data.data || [];
};

export const addWineMoment = async (id, payload) => {
  const { data } = await api.post(`/wines/${id}/moments`, payload);
  return data.data;
};


/**
 * Una acción sobre varios vinos, en una sola petición.
 *
 * `action`: "delete" | "tasted" | "untasted" | "favorite" | "unfavorite".
 * Devuelve cuántos cambiaron de verdad, que no siempre es cuántos se mandaron:
 * alguno pudo estar ya como se pedía, o haberse borrado en otra pestaña.
 */
export const bulkWines = async (ids, action) => {
  const { data } = await api.post("/wines/bulk", { ids, action });
  return data.data?.affected ?? 0;
};
