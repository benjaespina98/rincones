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

/**
 * Renovación de sesión.
 *
 * El token de acceso dura 15 minutos, así que un 401 casi siempre significa
 * "venció", no "no tenés permiso". En vez de mandar al login —que sería sacar a
 * la gente de la app cada cuarto de hora— se canjea el refresh y se reintenta la
 * llamada original. El usuario no se entera de nada.
 *
 * Una sola renovación a la vez: si vencen cinco llamadas juntas, las cinco
 * esperan la MISMA promesa. Sin esto se dispararían cinco refresh en paralelo y,
 * como el servidor rota el token en cada uso, cuatro llegarían con uno ya
 * consumido y cerrarían la sesión.
 */
let renovacionEnCurso = null;

const renovarSesion = async () => {
  if (!renovacionEnCurso) {
    renovacionEnCurso = api
      .post("/auth/refresh")
      .then((res) => {
        const token = res?.data?.data?.token;
        if (token) setAuthToken(token);
        return token;
      })
      .finally(() => {
        renovacionEnCurso = null;
      });
  }
  return renovacionEnCurso;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;
    const url = original?.url || "";
    const isMeCheck = url.includes("/auth/me");
    const isAuthCall = url.includes("/auth/");

    // `_reintentado` evita el bucle: si la llamada ya se rehizo con un token
    // nuevo y vuelve a dar 401, el problema no es la expiración.
    if (status === 401 && !isAuthCall && original && !original._reintentado) {
      original._reintentado = true;
      try {
        const token = await renovarSesion();
        if (token) return api(original);
      } catch {
        // El refresh también venció o fue revocado: abajo se cierra la sesión.
      }
    }

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
