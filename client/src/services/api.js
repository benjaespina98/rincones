import axios from "axios";
import { captureError } from "./errorMonitoring";

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

/**
 * El refresh tiene su propio timeout, más largo que los 12s del resto.
 *
 * No es un número al azar: renovar la sesión puede caer justo en un arranque en
 * frío del server (levantar el proceso + conectar a Mongo), y ahí 12 segundos se
 * pasan. Cuando eso ocurría, axios abortaba pero el server había rotado igual:
 * el token viejo quedaba consumido, el nuevo nunca llegaba y la sesión moría.
 * O sea que el timeout corto no protegía de nada y además rompía sesiones.
 *
 * El server ahora sobrevive a esa carrera (ver `rotateRefreshToken`), así que
 * esto es el cinturón además del airbag: la mayoría de las veces ya no hace
 * falta llegar a reintentar.
 */
const REFRESH_TIMEOUT_MS = 25000;

/**
 * ¿Este 401 merece que se intente renovar la sesión?
 *
 * Está afuera del interceptor para poder testearla: la regla es corta y su error
 * más probable —dejar afuera una ruta que sí tenía que renovar— no se nota en el
 * momento sino como "la app me saca la sesión", que es lo que efectivamente pasó
 * con `/auth/me` y tardó en encontrarse.
 *
 * Renuevan TODAS las llamadas protegidas, incluido `/auth/me` (es la que hidrata la
 * sesión al arrancar y usa el token de acceso como cualquier otra). No renuevan
 * login, registro, logout, recuperación de contraseña ni el refresh mismo: ninguna
 * necesita un token válido, así que un 401 ahí significa otra cosa.
 */
export const debeRenovarSesion = ({ status, url = "", yaReintentado = false }) => {
  if (status !== 401 || yaReintentado) return false;
  if (url.includes("/auth/me")) return true;
  return !url.includes("/auth/");
};

const renovarSesion = async () => {
  if (!renovacionEnCurso) {
    renovacionEnCurso = api
      .post("/auth/refresh", null, { timeout: REFRESH_TIMEOUT_MS })
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

    // Sólo 5xx: un 401 acá es la expiración normal de la sesión (ver arriba) y
    // un 4xx es una respuesta esperada (validación, permisos). Reportar esos
    // sería ruido, no una falla real. Nunca se manda el body de la request: sólo
    // a dónde y qué método, que alcanza para reconocer el endpoint que falló.
    if (status >= 500) {
      captureError(error, { url, method: original?.method, status });
    }

    // `_reintentado` evita el bucle: si la llamada ya se rehizo con un token
    // nuevo y vuelve a dar 401, el problema no es la expiración.
    if (original && debeRenovarSesion({ status, url, yaReintentado: original._reintentado })) {
      original._reintentado = true;
      try {
        const token = await renovarSesion();
        if (token) return api(original);
      } catch {
        // El refresh también venció o fue revocado: abajo se cierra la sesión.
      }
    }

    // Al login sólo se manda cuando la renovación ya falló. `/auth/me` no redirige:
    // es la consulta con la que la app averigua si hay sesión, y su respuesta
    // negativa la maneja quien la llamó.
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
