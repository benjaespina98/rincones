import api from "./api";
import { invalidarDestacados } from "./wineSearchApi";

export const getWishes = async () => {
  const { data } = await api.get("/wishes");
  return data.data || [];
};

export const createWish = async (payload) => {
  const { data } = await api.post("/wishes", payload);
  // Lo que guardás para probar no se vuelve a sugerir: el set guardado quedó viejo.
  invalidarDestacados();
  return data.data;
};

export const updateWish = async (id, patch) => {
  const { data } = await api.patch(`/wishes/${id}`, patch);
  return data.data;
};

export const deleteWish = async (id) => {
  const { data } = await api.delete(`/wishes/${id}`);
  invalidarDestacados();
  return data;
};

export const convertWishToWine = async (id, purchaseData = {}) => {
  const { data } = await api.patch(`/wishes/${id}/convert`, purchaseData);
  invalidarDestacados();
  return data.data;
};
