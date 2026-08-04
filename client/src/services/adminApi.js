import api from "./api";

/**
 * Los números del Resumen, contados por la base.
 *
 * Antes el panel los deducía de los últimos 60 movimientos, así que "Eventos 24h"
 * se plantaba en 60 y "Actividad por tipo" no decía de qué período hablaba.
 */
export const getAdminSummary = async (hours = 24) => {
  const { data } = await api.get("/admin/summary", { params: { hours } });
  return data.data;
};

export const getChangeLogs = async (limit = 40) => {
  const { data } = await api.get("/admin/logs", { params: { limit } });
  return data.data;
};

export const getUsers = async ({ page = 1, limit = 20, q = "", role = "" } = {}) => {
  const { data } = await api.get("/admin/users", { params: { page, limit, q, role } });
  return data;
};

export const updateUserRole = async (userId, role) => {
  const { data } = await api.put(`/admin/users/${userId}/role`, { role });
  return data;
};

/** Elimina la cuenta y todo su contenido (vinos, guardados, momentos, reseñas). */
export const deleteUser = async (userId) => {
  const { data } = await api.delete(`/admin/users/${userId}`);
  return data;
};

// --- Moderación de reseñas ---

export const getReviews = async ({ page = 1, limit = 20, q = "" } = {}) => {
  const { data } = await api.get("/admin/reviews", { params: { page, limit, q } });
  return data;
};

export const deleteReview = async (reviewId) => {
  const { data } = await api.delete(`/admin/reviews/${reviewId}`);
  return data;
};
