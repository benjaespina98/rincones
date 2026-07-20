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

// Manejo de expiración de sesión: si un endpoint protegido responde 401,
// redirigimos al login (salvo que ya estemos en una pantalla de auth o
// consultando /auth/me, que se usa para hidratar la sesión al iniciar).
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/admin"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    const isMeCheck = url.includes("/auth/me");
    const isAuthCall = url.includes("/auth/");

    if (status === 401 && !isMeCheck && !isAuthCall && typeof window !== "undefined") {
      const onAuthScreen = AUTH_PATHS.some((p) => window.location.pathname.startsWith(p));
      if (!onAuthScreen) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
