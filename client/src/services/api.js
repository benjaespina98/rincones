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
  withCredentials: true, // Cookie httpOnly como respaldo donde el navegador la permita
});

const TOKEN_KEY = "rincones_token";

export const setAuthToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage no disponible (modo privado, etc.): seguimos con la cookie.
  }
};

export const getAuthToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

// Adjuntamos el token por header Authorization. Es la vía robusta: funciona en
// Safari/iOS y entre dominios, donde la cookie de terceros se bloquea.
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Manejo de expiración de sesión: si un endpoint protegido responde 401,
// limpiamos el token y volvemos al login (salvo que ya estemos en una pantalla
// de auth o consultando /auth/me, que se usa para hidratar la sesión al iniciar).
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/admin"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    const isMeCheck = url.includes("/auth/me");
    const isAuthCall = url.includes("/auth/");

    if (status === 401 && !isMeCheck && !isAuthCall && typeof window !== "undefined") {
      setAuthToken(null);
      const onAuthScreen = AUTH_PATHS.some((p) => window.location.pathname.startsWith(p));
      if (!onAuthScreen) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
