import api from "./api";

/**
 * Medición de uso, del lado del cliente.
 *
 * ── TRES REGLAS QUE NO SE NEGOCIAN ──────────────────────────────────────────
 *
 * 1. NUNCA frena al usuario. Todo es fire-and-forget y los errores se tragan.
 *    Medir es una mejora del producto para vos; para quien lo usa es, en el mejor
 *    de los casos, invisible. Un `await` mal puesto acá haría que una pantalla
 *    tarde en abrirse por una estadística.
 *
 * 2. NUNCA manda datos personales. Sólo la pantalla (ya sin ids) y contexto del
 *    evento. Quién es el visitante lo resuelve el server con un hash anónimo que
 *    no vuelve atrás; acá no hay cookie, ni localStorage, ni identificador. Por
 *    eso la app no necesita cartel de consentimiento.
 *
 * 3. RESPETA "no me rastrees". Si el navegador manda la señal, no se envía nada.
 *    Cuesta un poco de subconteo y es lo correcto; además es lo que hace que la
 *    app pueda decir sin mentir que respeta la privacidad.
 *
 * ── POR QUÉ VA EN LOTES ─────────────────────────────────────────────────────
 * Una sesión normal genera muchos eventos chicos. Mandarlos de a uno serían
 * decenas de peticiones por visita: gasta batería y datos del usuario para nada.
 * Se juntan y se mandan cada 4 segundos, y siempre se vacía la cola antes de que
 * la pestaña se cierre —con `sendBeacon`, que el navegador entrega igual aunque
 * la página ya no exista—.
 */

const ENDPOINT = "/analytics/collect";
const INTERVALO_MS = 4000;
const MAX_COLA = 20;

const noRastrear = () => {
  if (typeof navigator === "undefined") return true;
  // Las tres formas en que los navegadores dijeron esto a lo largo del tiempo.
  const señal =
    navigator.doNotTrack ?? window.doNotTrack ?? navigator.msDoNotTrack ?? null;
  return señal === "1" || señal === "yes" || navigator.globalPrivacyControl === true;
};

// Se resuelve una sola vez: no cambia a mitad de sesión y no hace falta
// consultarlo en cada evento.
const habilitado = typeof window !== "undefined" && !noRastrear();

let cola = [];
let timer = null;

/** La URL absoluta del endpoint, que es lo que `sendBeacon` necesita. */
const urlAbsoluta = () => {
  const base = String(api.defaults.baseURL || "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) return `${base}${ENDPOINT}`;
  return `${window.location.origin}${base}${ENDPOINT}`;
};

/**
 * Vacía la cola. `conBeacon` es para el cierre de la pestaña: en ese momento una
 * petición normal se cancela a mitad de camino y el último evento —justamente el
 * que dice cuánto se quedó la persona— se pierde.
 */
const enviar = (conBeacon = false) => {
  if (cola.length === 0) return;
  const lote = cola;
  cola = [];

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const cuerpo = JSON.stringify({ events: lote });

  if (conBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(urlAbsoluta(), new Blob([cuerpo], { type: "application/json" }));
      return;
    } catch {
      // Si el beacon no sale, se intenta por la vía normal más abajo.
    }
  }

  // `api` lleva el token si hay sesión, que es lo que permite distinguir usuarios
  // de visitantes. Sin sesión funciona igual: la ruta es pública a propósito.
  api.post(ENDPOINT, { events: lote }).catch(() => {
    // Silencio: ver la regla 1.
  });
};

const encolar = (evento) => {
  if (!habilitado) return;
  cola.push(evento);

  // Con la cola llena se manda ya: acumular más sería arriesgar perder eventos
  // si el usuario cierra, y no ahorra nada.
  if (cola.length >= MAX_COLA) {
    enviar();
    return;
  }

  if (!timer) timer = setTimeout(() => enviar(), INTERVALO_MS);
};

/** Una pantalla vista. `path` sale del router; el server le saca los ids. */
export const trackPageview = (path) => encolar({ type: "pageview", path });

/**
 * Cualquier otra cosa que valga la pena contar: un vino cargado, un destacado
 * clickeado, una búsqueda hecha. `meta` es contexto corto, nunca datos de nadie.
 */
export const trackEvent = (type, meta) => {
  if (!habilitado) return;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  encolar({ type, path, meta });
};

/**
 * Se engancha al arrancar la app y DEVUELVE su limpieza.
 *
 * Devolver la limpieza no es ceremonia: en desarrollo React monta y desmonta cada
 * componente dos veces (StrictMode), así que sin esto los dos listeners quedarían
 * duplicados y cada cierre de pestaña mandaría el lote dos veces. Se vería como
 * el doble de actividad justo mientras estás probando.
 *
 * `visibilitychange` y no `beforeunload`: en móviles `beforeunload` casi no se
 * dispara —cambiar de app no es cerrar la pestaña— así que confiar en él pierde
 * la última tanda de eventos de casi todas las visitas desde el celular, que son
 * la mayoría.
 */
export const initAnalytics = () => {
  if (!habilitado || typeof document === "undefined") return undefined;

  const alOcultarse = () => {
    if (document.visibilityState === "hidden") enviar(true);
  };
  const alSalir = () => enviar(true);

  document.addEventListener("visibilitychange", alOcultarse);
  // Respaldo para escritorio, donde sí ocurre.
  window.addEventListener("pagehide", alSalir);

  return () => {
    document.removeEventListener("visibilitychange", alOcultarse);
    window.removeEventListener("pagehide", alSalir);
  };
};

/** Para el panel admin. */
export const getAnalyticsSummary = async (days = 30) => {
  const { data } = await api.get("/analytics/summary", { params: { days } });
  return data?.data || null;
};
