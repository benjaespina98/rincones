import axios from "axios";

const devApiUrl = "http://localhost:4000/api";

const normalizeApiUrl = (value) => String(value || "").trim().replace(/\/$/, "");

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
const configuredLooksLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/api)?$/i.test(
  configuredApiUrl
);

// En producción usamos una ruta relativa (mismo origen) que Vercel redirige a la API
// mediante un rewrite (ver client/vercel.json). Así la cookie de sesión es first-party
// y funciona en Safari/iOS (que bloquea cookies de terceros entre subdominios).
// En desarrollo apuntamos al server local.
const baseURL = import.meta.env.PROD
  ? (configuredApiUrl && !configuredLooksLocal ? configuredApiUrl : "/api")
  : (configuredApiUrl || devApiUrl);

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
