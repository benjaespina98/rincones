import axios from "axios";

const fallbackApiUrl = import.meta.env.PROD
  ? "https://rincones-api.vercel.app/api"
  : "http://localhost:4000/api";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || fallbackApiUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rincones_admin_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
