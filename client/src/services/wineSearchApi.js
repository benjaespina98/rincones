// Búsqueda de vinos conocidos.
//
// Delega en el server (/api/catalog/search): antes se llamaba a Open Food Facts
// directo desde el browser y CORS lo bloqueaba en cada búsqueda, lo que la UI
// mostraba como "Sin resultados". El server además prioriza vino argentino.

import api from "./api";

/**
 * Busca vinos por texto. Devuelve un array normalizado.
 * Lanza si la búsqueda falla, para que la UI distinga "no hay resultados"
 * de "no pudimos buscar".
 */
export const searchWines = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const { data } = await api.get("/catalog/search", { params: { q } });
  return Array.isArray(data?.data) ? data.data : [];
};

/**
 * Vinos destacados para la home Descubrí (catálogo curado, sin gastar cuota IA).
 */
export const getFeaturedWines = async () => {
  const { data } = await api.get("/catalog/featured");
  return Array.isArray(data?.data) ? data.data : [];
};

/**
 * Precio comunitario de un vino (promedio de lo que pagó la gente).
 * Devuelve { avg, count, min, max, currency } o null.
 */
export const getWinePrice = async (name, winery) => {
  const { data } = await api.get("/catalog/price", { params: { name, winery } });
  return data?.data || null;
};

// URL de búsqueda del vino en MercadoLibre (siempre actual, sin API).
export const mercadoLibreUrl = (name, winery) => {
  const q = [name, winery].filter(Boolean).join(" ");
  return `https://listado.mercadolibre.com.ar/${encodeURIComponent(q)}`;
};

/**
 * Trae la ficha del vino (descripción, aromas, maridaje) generada por IA y
 * cacheada en el server. Lanza si falla, para que la UI muestre un estado claro.
 */
export const describeWine = async (wine) => {
  const { data } = await api.post("/catalog/describe", {
    name: wine.name,
    winery: wine.winery,
    varietal: wine.varietal,
    type: wine.type,
    region: wine.region,
    vintage: wine.vintage,
  });
  return data?.data || null;
};

/**
 * Busca en el catálogo el vino que corresponde a una lectura de etiqueta.
 * Devuelve null si no hay coincidencia confiable — el server prefiere no
 * completar nada antes que completar con otra botella.
 */
export const matchCatalogWine = async (reading) => {
  const { data } = await api.post("/catalog/match", {
    winery: reading.winery || "",
    line: reading.line || "",
    name: reading.properName || reading.name || "",
    varietal: reading.varietal || "",
    vintage: reading.vintage || "",
  });
  return data?.data || null;
};
