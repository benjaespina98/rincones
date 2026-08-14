import api, { setAuthToken } from "./api";

export const login = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  if (data.data?.token) setAuthToken(data.data.token);
  return data.data;
};

export const register = async (email, password, firstName = "", birthDate = "") => {
  const { data } = await api.post("/auth/register", { email, password, firstName, birthDate });
  if (data.data?.token) setAuthToken(data.data.token);
  return data.data;
};

export const getMe = async () => {
  const { data } = await api.get("/auth/me");
  return data.data;
};

export const logout = async () => {
  try {
    const { data } = await api.post("/auth/logout");
    return data;
  } finally {
    setAuthToken(null);
  }
};

export const forgotPassword = async (email) => {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data; // puede incluir { resetUrl } en entorno de desarrollo
};

export const resetPassword = async ({ token, email, newPassword }) => {
  const { data } = await api.post("/auth/reset-password", { token, email, newPassword });
  return data;
};

export const verifyEmail = async ({ token, email }) => {
  const { data } = await api.post("/auth/verify-email", { token, email });
  return data;
};

export const resendVerification = async () => {
  const { data } = await api.post("/auth/resend-verification");
  return data; // puede incluir { verifyUrl } en entorno de desarrollo
};

export const getProfile = async () => {
  const { data } = await api.get("/users/profile");
  return data.data;
};

export const updateProfile = async (profileData) => {
  const { data } = await api.put("/users/profile", profileData);
  return data.data;
};

// Guarda las preferencias elegidas en el onboarding y lo marca como completado.
export const saveOnboarding = async ({ favoriteTypes, favoriteVarietals }) => {
  const { data } = await api.put("/users/profile", {
    favoriteTypes,
    favoriteVarietals,
    onboarded: true,
  });
  return data.data;
};

export const updatePassword = async (currentPassword, newPassword) => {
  const { data } = await api.put("/users/password", {
    currentPassword,
    newPassword,
  });
  return data;
};

