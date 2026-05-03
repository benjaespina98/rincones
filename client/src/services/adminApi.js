import api from "./api";

export const getChangeLogs = async (limit = 40) => {
  const { data } = await api.get("/admin/logs", { params: { limit } });
  return data.data;
};

export const getUsers = async (page = 1, limit = 20) => {
  const { data } = await api.get("/admin/users", { params: { page, limit } });
  return data;
};

export const updateUserRole = async (userId, role) => {
  const { data } = await api.put(`/admin/users/${userId}/role`, { role });
  return data;
};
