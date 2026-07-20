import api from "./api";

export const login = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  return data.data;
};

export const register = async (email, password, firstName = "") => {
  const { data } = await api.post("/auth/register", { email, password, firstName });
  return data.data;
};

export const getMe = async () => {
  const { data } = await api.get("/auth/me");
  return data.data;
};

export const logout = async () => {
  const { data } = await api.post("/auth/logout");
  return data;
};

export const forgotPassword = async (email) => {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data; // puede incluir { resetUrl } en entorno de desarrollo
};

export const resetPassword = async ({ token, email, newPassword }) => {
  const { data } = await api.post("/auth/reset-password", { token, email, newPassword });
  return data;
};

export const getProfile = async () => {
  const { data } = await api.get("/users/profile");
  return data.data;
};

export const updateProfile = async (profileData) => {
  const { data } = await api.put("/users/profile", profileData);
  return data.data;
};

export const updatePassword = async (currentPassword, newPassword) => {
  const { data } = await api.put("/users/password", {
    currentPassword,
    newPassword,
  });
  return data;
};

export const getUserStats = async () => {
  const { data } = await api.get("/users/stats");
  return data.data;
};
