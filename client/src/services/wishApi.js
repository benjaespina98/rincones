import api from "./api";

export const getWishes = async () => {
  const { data } = await api.get("/wishes");
  return data.data || [];
};

export const createWish = async (payload) => {
  const { data } = await api.post("/wishes", payload);
  return data.data;
};

export const updateWish = async (id, patch) => {
  const { data } = await api.patch(`/wishes/${id}`, patch);
  return data.data;
};

export const deleteWish = async (id) => {
  const { data } = await api.delete(`/wishes/${id}`);
  return data;
};

export const convertWishToWine = async (id, purchaseData = {}) => {
  const { data } = await api.patch(`/wishes/${id}/convert`, purchaseData);
  return data.data;
};
