import api from "./api";

export const getLugares = async () => {
  const { data } = await api.get("/lugares");
  return data.data;
};

export const getLugarById = async (id) => {
  const { data } = await api.get(`/lugares/${id}`);
  return data.data;
};

export const createLugar = async (payload) => {
  const { data } = await api.post("/lugares", payload);
  return data.data;
};

export const updateLugar = async (id, payload) => {
  const { data } = await api.put(`/lugares/${id}`, payload);
  return data.data;
};

export const deleteLugar = async (id) => {
  const { data } = await api.delete(`/lugares/${id}`);
  return data;
};
