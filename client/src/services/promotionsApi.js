import api from "./api";

/** Los destacados al aire que ve cualquiera. Nunca lanza: es contenido extra. */
export const getPromotions = async () => {
  try {
    const { data } = await api.get("/promotions");
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    // Si esto falla, Descubrí muestra su contenido curado y nadie se enteró.
    return [];
  }
};

/**
 * Impresiones y clics, en lote y fire-and-forget.
 *
 * ── POR QUÉ EN LOTE ─────────────────────────────────────────────────────────
 * Antes cada tarjeta que aparecía mandaba su propia petición: un carrusel de seis
 * eran seis peticiones por visita a la pantalla de entrada de la app, sólo para
 * contar. Multiplicado por la cantidad de gente que abre Descubrí, medir costaba
 * más tráfico que servir el contenido. Ahora se juntan y se van de una.
 *
 * ── POR QUÉ EL CLIC NO ESPERA ───────────────────────────────────────────────
 * Cuando alguien toca la tarjeta, el navegador ya está yendo al sitio del
 * anunciante. Una petición normal en ese momento se cancela a mitad de camino y se
 * pierde justo el número que el anunciante va a pedir. Por eso el clic vacía la
 * cola al instante y con `sendBeacon`, que el navegador entrega igual aunque la
 * página ya no exista.
 */

const ENDPOINT = "/promotions/events";
const ESPERA_MS = 1500;

let cola = [];
let timer = null;

/** La URL absoluta del endpoint, que es lo que `sendBeacon` necesita. */
const urlAbsoluta = () => {
  const base = String(api.defaults.baseURL || "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) return `${base}${ENDPOINT}`;
  return `${window.location.origin}${base}${ENDPOINT}`;
};

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

  api.post(ENDPOINT, { events: lote }).catch(() => {
    // Silencio: un contador no puede molestar a nadie.
  });
};

const encolar = (id, type) => {
  if (!id) return;
  cola.push({ id, type });
  // El clic se va ya: el navegador está por dejar la página.
  if (type === "click") {
    enviar(true);
    return;
  }
  if (!timer) timer = setTimeout(() => enviar(), ESPERA_MS);
};

export const trackPromoImpression = (id) => encolar(id, "impression");
export const trackPromoClick = (id) => encolar(id, "click");

/**
 * Se engancha al arrancar la app y devuelve su limpieza, igual que el analytics:
 * si la pestaña se cierra con impresiones en la cola, se van con `sendBeacon` en
 * vez de perderse. Sin esto, la última tarjeta de cada visita no se contaría nunca
 * —y en una visita corta puede ser la única—.
 */
export const initPromoTracking = () => {
  if (typeof document === "undefined") return undefined;

  const alOcultarse = () => {
    if (document.visibilityState === "hidden") enviar(true);
  };
  const alSalir = () => enviar(true);

  document.addEventListener("visibilitychange", alOcultarse);
  window.addEventListener("pagehide", alSalir);

  return () => {
    document.removeEventListener("visibilitychange", alOcultarse);
    window.removeEventListener("pagehide", alSalir);
  };
};

// ── Panel admin ────────────────────────────────────────────────────────────

/**
 * El listado del panel. Devuelve las campañas con su estado YA RESUELTO por el
 * server, no el dato crudo: el estado ("Activa", "Programada", …) lo calcula el
 * mismo código que decide si la campaña se muestra, así que el panel no puede
 * decir una cosa distinta de lo que hace la app.
 */
export const getAllPromotions = async ({ page = 1, state = "", q = "", kind = "", limit = 25 } = {}) => {
  const { data } = await api.get("/promotions/all", { params: { page, state, q, kind, limit } });
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    page: data?.page || 1,
    pages: data?.pages || 1,
    total: data?.total || 0,
    summary: data?.summary || { active: 0, scheduled: 0, paused: 0, ended: 0, total: 0 },
  };
};

export const getPromotionStats = async (id, days = 30) => {
  const { data } = await api.get(`/promotions/${id}/stats`, { params: { days } });
  return data?.data || null;
};

export const createPromotion = async (payload) => {
  const { data } = await api.post("/promotions", payload);
  return data?.data;
};

export const updatePromotion = async (id, payload) => {
  const { data } = await api.put(`/promotions/${id}`, payload);
  return data?.data;
};

/** Mostrar u oculta la campaña. Su propio endpoint: una operación, un significado. */
export const setPromotionVisibility = async (id, visible) => {
  const { data } = await api.patch(`/promotions/${id}/visibility`, { visible });
  return data?.data;
};

/** Sube o baja la campaña un lugar en el carrusel. */
export const movePromotion = async (id, direction) => {
  const { data } = await api.patch(`/promotions/${id}/move`, { direction });
  return data?.moved === true;
};

export const deletePromotion = async (id) => {
  await api.delete(`/promotions/${id}`);
  return true;
};

/**
 * El informe que abre el anunciante con su enlace. No pide sesión: la llave es
 * el enlace, y por eso este llamado no pasa por la instancia con credenciales.
 */
export const getPublicReport = async (token, rango = { days: 30 }) => {
  const { data } = await api.get(`/promotions/report/${encodeURIComponent(token)}`, {
    params: rango,
  });
  return data.data;
};

/** Genera o recupera el enlace del informe de una campaña. Sólo admin. */
export const getReportLink = async (id) => {
  const { data } = await api.post(`/promotions/${id}/report-link`);
  return data.data?.token || "";
};

/** Corta el enlace. Los números quedan; sólo deja de poder verlos. */
export const revokeReportLink = async (id) => {
  await api.delete(`/promotions/${id}/report-link`);
};
