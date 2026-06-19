import axios from "axios";

const devApiUrl = "http://localhost:4000/api";
const prodApiUrl = "https://rincones-api.vercel.app/api";

const normalizeApiUrl = (value) => String(value || "").trim().replace(/\/$/, "");

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
const configuredLooksLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/api)?$/i.test(
  configuredApiUrl
);

const fallbackApiUrl = import.meta.env.PROD ? prodApiUrl : devApiUrl;
const baseURL = import.meta.env.PROD && configuredLooksLocal
  ? prodApiUrl
  : configuredApiUrl || fallbackApiUrl;

const api = axios.create({
  baseURL,
  timeout: 12000,
  withCredentials: true, // Permitir envío automático de cookies (httpOnly)
});

export default api;
