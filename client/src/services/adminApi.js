import api from "./api";

export const getChangeLogs = async (limit = 40) => {
  const { data } = await api.get("/admin/logs", { params: { limit } });
  return data.data;
};
