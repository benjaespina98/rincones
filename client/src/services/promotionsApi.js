import api from "./api";

/** Los destacados vigentes que ve cualquiera. Nunca lanza: es contenido extra. */
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
 * Cuenta una impresión o un clic. Fire-and-forget.
 *
 * El clic se manda con `sendBeacon` porque el navegador está yendo al sitio del
 * anunciante en ese mismo instante: una petición normal se cancela a mitad de
 * camino y se perdería justo el número que el anunciante va a pedir.
 */
const contar = (id, tipo) => {
  if (!id) return;
  const ruta = `/promotions/${id}/${tipo}`;

  if (tipo === "click" && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const base = String(api.defaults.baseURL || "").replace(/\/$/, "");
    const url = /^https?:\/\//i.test(base)
      ? `${base}${ruta}`
      : `${window.location.origin}${base}${ruta}`;
    try {
      navigator.sendBeacon(url, new Blob([], { type: "application/json" }));
      return;
    } catch {
      // Cae a la vía normal.
    }
  }

  api.post(ruta).catch(() => {});
};

export const trackPromoImpression = (id) => contar(id, "impression");
export const trackPromoClick = (id) => contar(id, "click");

// ── Panel admin ────────────────────────────────────────────────────────────

export const getAllPromotions = async () => {
  const { data } = await api.get("/promotions/all");
  return Array.isArray(data?.data) ? data.data : [];
};

export const createPromotion = async (payload) => {
  const { data } = await api.post("/promotions", payload);
  return data?.data;
};

export const updatePromotion = async (id, payload) => {
  const { data } = await api.put(`/promotions/${id}`, payload);
  return data?.data;
};

export const deletePromotion = async (id) => {
  await api.delete(`/promotions/${id}`);
  return true;
};
