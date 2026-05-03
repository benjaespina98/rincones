import axios from "axios";

const fallbackApiUrl = import.meta.env.PROD
  ? "https://rincones-api.vercel.app/api"
  : "http://localhost:4000/api";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || fallbackApiUrl,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Permitir envío automático de cookies (httpOnly)
});

api.interceptors.request.use((config) => {
  // Fallback: si hay token en localStorage, agregarlo al header
  // (para compatibilidad, pero el método seguro es via httpOnly cookies)
  const token = localStorage.getItem("rincones_admin_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
