import api from "./api";

// Obtener todos los vinos del usuario
export const getWines = async () => {
  try {
    const { data } = await api.get("/vinos");
    return data.data || [];
  } catch (error) {
    console.error("Error fetching wines:", error);
    throw error;
  }
};

// Obtener un vino por ID
export const getWineById = async (id) => {
  try {
    const { data } = await api.get(`/vinos/${id}`);
    return data.data;
  } catch (error) {
    console.error("Error fetching wine:", error);
    throw error;
  }
};

// Crear un nuevo vino
export const createWine = async (payload) => {
  try {
    const { data } = await api.post("/vinos", payload);
    return data.data;
  } catch (error) {
    console.error("Error creating wine:", error);
    throw error;
  }
};

// Actualizar un vino
export const updateWine = async (id, payload) => {
  try {
    const { data } = await api.put(`/vinos/${id}`, payload);
    return data.data;
  } catch (error) {
    console.error("Error updating wine:", error);
    throw error;
  }
};

// Eliminar un vino
export const deleteWine = async (id) => {
  try {
    const { data } = await api.delete(`/vinos/${id}`);
    return data;
  } catch (error) {
    console.error("Error deleting wine:", error);
    throw error;
  }
};

// Obtener sugerencias de vinos
export const getWineSuggestions = async () => {
  try {
    const { data } = await api.get("/vinos/suggestions");
    return data.data || [];
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    throw error;
  }
};

// Marcar como favorito/no favorito
export const toggleWineFavorite = async (id, isFavorite) => {
  try {
    const { data } = await api.patch(`/vinos/${id}/favorite`, {
      favorite: isFavorite,
    });
    return data.data;
  } catch (error) {
    console.error("Error toggling favorite:", error);
    throw error;
  }
};

// Marcar como probado/no probado
export const toggleWineTasted = async (id, isTasted) => {
  try {
    const { data } = await api.patch(`/vinos/${id}/tasted`, {
      tasted: isTasted,
    });
    return data.data;
  } catch (error) {
    console.error("Error toggling tasted:", error);
    throw error;
  }
};

// Escanear etiqueta de vino (OCR)
export const scanWineLabel = async (imageFile) => {
  try {
    const formData = new FormData();
    formData.append("image", imageFile);
    const { data } = await api.post("/vinos/scan", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  } catch (error) {
    console.error("Error scanning wine label:", error);
    throw error;
  }
};
