import axios from "axios";
import { captureError } from "./errorMonitoring";
import { CLAVE_USUARIO } from "../utils/claveUsuario";

const devApiUrl = "http://localhost:4000/api";

const normalizeApiUrl = (value) => String(value || "").trim().replace(/\/$/, "");

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);

/**
 * ── "SE ME CIERRA LA SESIÓN SOLA DESPUÉS DE UN RATO" ────────────────────────
 *
 * Ésta era la causa, y estaba acá: en producción la app le pegaba a
 * `https://rincones-api.vercel.app/api` en vez de a `/api`.
 *
 * Verificado en el bundle publicado: `VITE_API_URL` está cargada en Vercel con
 * la URL absoluta de la API, y la condición vieja la aceptaba con sólo no ser
 * localhost. O sea que el rewrite de `client/vercel.json` —que existe
 * exactamente para que las llamadas salgan por el MISMO origen— quedaba sin
 * usar, y una variable de entorno bien intencionada desactivaba en silencio la
 * única razón por la que ese rewrite estaba puesto.
 *
 * Por qué eso mata la sesión: `rincones.vercel.app` y `rincones-api.vercel.app`
 * NO son dos subdominios del mismo sitio. `vercel.app` está en la Public Suffix
 * List, así que para el navegador son dos sitios distintos, y las cookies de
 * sesión (`authToken`, `refreshToken`, `SameSite=None; Secure`) pasan a ser
 * cookies de terceros. Safari/iOS las bloquea siempre; Chrome en incógnito y
 * bajo las restricciones nuevas; Firefox las aisla por sitio.
 *
 * Y el síntoma es exactamente el que se reportó, porque el token de acceso NO
 * viaja en cookie sino en el header `Authorization` desde localStorage:
 *
 *   entrás           → anda, el token nuevo está en localStorage
 *   15 minutos       → el token vence
 *   se abre la app   → 401 → se pide `/auth/refresh` → la cookie de refresh no
 *                      se manda (es de terceros) → 401 → al login
 *
 * De ahí que "reinstalar la PWA lo arregla temporalmente": no arregla nada,
 * te hace loguear de nuevo y volvés a tener 15 minutos de token fresco. Y de
 * ahí que pase igual en navegador y en PWA: no es del service worker (no hay),
 * es de dónde vive la cookie.
 *
 * ── LA REGLA, AHORA ─────────────────────────────────────────────────────────
 *
 * En producción sólo se acepta una URL configurada si es del MISMO origen que
 * la página. Cualquier otra cosa cae a `/api`, que es el rewrite. No es que la
 * variable esté prohibida: es que una URL cross-origin rompe la sesión de una
 * forma que no se nota hasta 15 minutos después, y eso no puede depender de que
 * nadie la cargue en el panel de Vercel. La condición vieja miraba lo que no
 * importaba (si parecía local); lo que importa es si es el mismo origen.
 */
export const resolverBaseUrl = ({ configurada, origen, produccion }) => {
  if (!produccion) return configurada || devApiUrl;
  if (!configurada) return "/api";
  // Relativa: ya es del mismo origen por definición.
  if (configurada.startsWith("/")) return configurada;
  try {
    return new URL(configurada).origin === origen ? configurada : "/api";
  } catch {
    return "/api";
  }
};

const baseURL = resolverBaseUrl({
  configurada: configuredApiUrl,
  origen: typeof window !== "undefined" ? window.location.origin : "",
  produccion: import.meta.env.PROD,
});

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

/**
 * ¿El token de acceso guardado ya venció (o vence en segundos)?
 *
 * Se lee el `exp` del propio JWT, sin verificarlo (eso es cosa del server): sólo sirve para no mandar un pedido que ya
 * se sabe que va a dar 401. Un token que no se puede leer cuenta como vigente: ahí manda el server, como siempre.
 */
export const tokenVencido = (token = getAuthToken(), ahora = Date.now()) => {
  if (!token) return false;
  try {
    const carga = token.split(".")[1];
    const json = atob(carga.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = Number(JSON.parse(json).exp);
    return Number.isFinite(exp) && exp * 1000 - 5000 <= ahora;
  } catch {
    return false;
  }
};

/**
 * ¿Este pedido tiene que esperar a que se renueve la sesión antes de salir?
 * Los de /auth/ no (login, registro, el propio refresh), salvo /auth/me, que usa el token como cualquier otro.
 */
const esperaRenovacion = (url = "") => !url.includes("/auth/") || url.includes("/auth/me");

// Adjuntamos el token por header Authorization. Es la vía robusta: funciona en
// Safari/iOS y entre dominios, donde la cookie de terceros se bloquea.
api.interceptors.request.use(async (config) => {
  /**
   * Al reabrir la app pasados los 15 minutos del token, cada pedido salía con el vencido, volvía con 401, esperaba la
   * renovación y se repetía: tres viajes en fila antes de ver nada. Ahora, si ya se sabe que venció, se renueva ANTES
   * (una sola vez, compartida entre todos los pedidos en vuelo) y el pedido sale con el token nuevo.
   */
  if (tokenVencido() && esperaRenovacion(config.url)) {
    try {
      await renovarSesion();
    } catch (error) {
      // Si renovar no se pudo, el pedido sale igual y el 401 (o el corte de red) lo resuelve quien llama. Se anota el
      // porqué para NO volver a renovar en la respuesta: dos esperas de hasta 25 s seguidas castigaban justo el
      // arranque en frío.
      config._falloDeRenovacion = error;
    }
  }
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
    // La renovación ya se intentó (y falló) antes de salir el pedido: no se repite. Si falló por red o por el server, eso
    // es lo que se informa (no «no hay sesión»); si el refresh contestó 401/403, la sesión terminó de verdad y se sigue.
    const falloPrevio = original?._falloDeRenovacion;
    if (falloPrevio && status === 401) {
      const estadoRefresh = falloPrevio?.response?.status;
      if (estadoRefresh === undefined || estadoRefresh >= 500) return Promise.reject(falloPrevio);
    }

    if (original && debeRenovarSesion({ status, url, yaReintentado: original._reintentado || Boolean(falloPrevio) })) {
      original._reintentado = true;
      try {
        const token = await renovarSesion();
        if (token) return api(original);
      } catch (refreshError) {
        const refreshStatus = refreshError?.response?.status;
        // El refresh mismo no pudo contestar (timeout, sin red, arranque en frío
        // del server: exactamente lo esperable al reabrir la PWA después de un
        // rato). Eso NO dice que la sesión terminó, sólo que no se pudo preguntar
        // — y sin embargo, si seguíamos de largo, lo que llegaba a quien llamó
        // (AuthContext) era el 401 ORIGINAL de `/auth/me`, que sí mira como
        // definitivo. Ahí es donde la app deslogueaba con una sesión viva: el
        // fallo de red del refresh se disfrazaba de "no hay sesión". Propagar el
        // error del refresh (sin status, o 5xx) en vez del 401 original deja que
        // `esFalloDeRed` en el cliente lo reconozca como lo que es.
        if (refreshStatus === undefined || refreshStatus >= 500) {
          return Promise.reject(refreshError);
        }
        // El refresh sí contestó (401/403): la sesión terminó de verdad. Seguimos
        // abajo con el 401 original, que cierra sesión como corresponde.
      }
    }

    // Al login sólo se manda cuando la renovación ya falló. `/auth/me` no redirige:
    // es la consulta con la que la app averigua si hay sesión, y su respuesta
    // negativa la maneja quien la llamó.
    if (status === 401 && !isMeCheck && !isAuthCall && typeof window !== "undefined") {
      setAuthToken(null);
      try {
        // El usuario guardado se va con el token: no queda dato personal de una sesión que ya no existe.
        localStorage.removeItem(CLAVE_USUARIO);
      } catch {
        // Sin almacenamiento no hay nada que borrar.
      }
      const onAuthScreen = AUTH_PATHS.some((p) => window.location.pathname.startsWith(p));
      if (!onAuthScreen) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
