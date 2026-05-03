import api from "./api";

// GET /api/wines - Obtener todos los vinos del usuario
export const getWines = async () => {
  const { data } = await api.get("/wines");
  return data.data;
};

// GET /api/wines/:id - Obtener un vino específico
export const getWine = async (id) => {
  const { data } = await api.get(`/wines/${id}`);
  return data.data;
};

// POST /api/wines - Crear un nuevo vino
export const createWine = async (wineData) => {
  const { data } = await api.post("/wines", wineData);
  return data.data;
};

// PUT /api/wines/:id - Actualizar un vino
export const updateWine = async (id, wineData) => {
  const { data } = await api.put(`/wines/${id}`, wineData);
  return data.data;
};

// DELETE /api/wines/:id - Eliminar un vino
export const deleteWine = async (id) => {
  const { data } = await api.delete(`/wines/${id}`);
  return data;
};

// GET /api/wines/stats/summary - Obtener estadísticas de vinos
export const getWineStats = async () => {
  const { data } = await api.get("/wines/stats/summary");
  return data.data;
};
