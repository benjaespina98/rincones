import api from "./api";
import { invalidarDestacados } from "./wineSearchApi";

export const getWines = async () => {
  const { data } = await api.get("/wines");
  return data.data || [];
};

export const getWineById = async (id) => {
  const { data } = await api.get(`/wines/${id}`);
  return data.data;
};

/**
 * Crea un vino, o SUMA botellas a uno que ya tenías.
 *
 * Devuelve `{ wine, merged, added }` y no el vino pelado, porque `merged` es la
 * diferencia entre dos cosas que no se pueden tratar igual: si el server
 * reconoció el vino, no nació una fila nueva —le sumó botellas a la que ya
 * estaba— y quien tenga la lista en memoria tiene que REEMPLAZAR esa fila, no
 * agregar otra. Descartando el flag, la única salida era agregar siempre, y eso
 * mete el mismo `_id` dos veces en la lista.
 */
export const createWine = async (payload) => {
  const { data } = await api.post("/wines", payload);
  // La bodega cambió, así que las recomendaciones guardadas quedaron viejas: el
  // vino recién cargado no puede seguir apareciendo como sugerencia.
  invalidarDestacados();
  return { wine: data.data, merged: data.merged === true, added: data.added ?? 0 };
};

export const updateWine = async (id, payload) => {
  const { data } = await api.put(`/wines/${id}`, payload);
  invalidarDestacados();
  return data.data;
};

export const deleteWine = async (id) => {
  const { data } = await api.delete(`/wines/${id}`);
  invalidarDestacados();
  return data;
};

export const adjustWineStock = async (id, delta, extra = {}) => {
  const { data } = await api.patch(`/wines/${id}/stock`, { delta, ...extra });
  // Sumar, abrir o deshacer cambia lo que tomaste y lo que tenés: los motivos de la tarjeta salen de ahí.
  invalidarDestacados();
  return data.data;
};

/**
 * Abrir botellas: las descuenta del stock y deja el vino marcado como probado,
 * en una sola operación. Descontar con "−" a secas NO marca probado: también se
 * saca una botella para regalarla o para corregir un número.
 *
 * `cantidad` existe porque abrir tres botellas en un asado es normal y hasta
 * ahora había que tocar el botón tres veces, con sus tres avisos y sus tres
 * "Deshacer" —de los cuales sólo el último servía—. El servidor ya aceptaba
 * cualquier delta; lo único que faltaba era pedírselo.
 */
export const openBottle = async (id, cantidad = 1) => {
  const n = Math.max(1, Number.parseInt(cantidad, 10) || 1);
  return adjustWineStock(id, -n, { markTasted: true });
};

/**
 * Deshacer lo anterior. `wasTasted` es cómo estaba el vino ANTES de abrir: si ya
 * lo habías probado, deshacer no puede borrarte ese dato. `cantidad` tiene que
 * ser la misma que se abrió, para devolver exactamente lo que salió.
 */
export const undoOpenBottle = async (id, wasTasted, cantidad = 1, consumosAntes) => {
  const n = Math.max(1, Number.parseInt(cantidad, 10) || 1);
  const extra = { undoOpen: true, wasTasted: wasTasted === true };
  // Cuántos consumos tenía el vino ANTES de abrir. Con eso el servidor distingue «sigue probado
  // porque hubo otras aperturas» de «tenía consumos viejos pero no estaba marcado como probado».
  if (Number.isFinite(consumosAntes)) extra.consumosAntes = consumosAntes;
  return adjustWineStock(id, n, extra);
};

export const getWineStats = async () => {
  const { data } = await api.get("/wines/stats/summary");
  return data.data;
};

export const getSpendingStats = async () => {
  const { data } = await api.get("/wines/stats/spending");
  return data.data;
};

export const getSuggestedWines = async (context = {}) => {
  const { data } = await api.post("/wines/suggest", context);
  return data.data || [];
};

/**
 * Los vinos TUYOS que están en su mejor momento: con botellas y dentro de su
 * ventana de guarda.
 *
 * El endpoint existía en el servidor desde hace tiempo y no lo llamaba nadie —
 * la respuesta a "¿qué abro hoy?" estaba calculada y sin usar—. Cada uno viene
 * con su `cellarStatus`, que es de dónde sale la ventana que se muestra.
 */
export const getCellarReady = async () => {
  const { data } = await api.get("/wines/cellar-ready");
  return data.data || [];
};

export const getWineMoments = async (id) => {
  const { data } = await api.get(`/wines/${id}/moments`);
  return data.data || [];
};

/**
 * Tu diario completo: todos tus momentos, de todos tus vinos. Cada uno trae el
 * vino al que pertenece (o null, si lo borraste de la bodega).
 */
export const getAllMoments = async () => {
  const { data } = await api.get("/wines/moments");
  return data.data || [];
};

export const addWineMoment = async (id, payload) => {
  const { data } = await api.post(`/wines/${id}/moments`, payload);
  invalidarDestacados();
  return data.data;
};


/**
 * Una acción sobre varios vinos, en una sola petición.
 *
 * `action`: "delete" | "tasted" | "untasted" | "favorite" | "unfavorite".
 * Devuelve cuántos cambiaron de verdad, que no siempre es cuántos se mandaron:
 * alguno pudo estar ya como se pedía, o haberse borrado en otra pestaña.
 */
export const bulkWines = async (ids, action) => {
  const { data } = await api.post("/wines/bulk", { ids, action });
  invalidarDestacados();
  return data.data?.affected ?? 0;
};
