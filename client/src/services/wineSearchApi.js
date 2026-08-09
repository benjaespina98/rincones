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
 *
 * ── POR QUÉ SE CACHEA ──────────────────────────────────────────────────────
 * Lo que devuelve el server es determinístico por día: sale del catálogo curado
 * barajado con una semilla que es la fecha (ver `getFeatured` en
 * catalog.service.js). O sea que dos llamadas el mismo día devuelven exactamente
 * lo mismo, y la estábamos haciendo en cada montaje de Descubrí — cada vez que
 * volvés a la home desde otra pestaña.
 *
 * Eso importaba más de lo que parece: el resto de la pantalla es data local y se
 * pinta en el primer frame, así que esta era la ÚNICA pieza que esperaba a la
 * red, y encima pasa por `authenticate`, con lo que en un arranque en frío podía
 * encadenarse detrás de una renovación de sesión. La tarjeta principal de la
 * home llegaba última por pedir algo que ya sabíamos.
 *
 * `sessionStorage` y no `localStorage`: es una optimización de la sesión de uso,
 * no un dato que valga la pena persistir entre días. La clave lleva la fecha, así
 * que a la medianoche deja de servir sola y no hay que invalidarla a mano.
 */
const FEATURED_KEY = "rincones_featured";

const hoyEnArgentina = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const getFeaturedWines = async () => {
  const clave = `${FEATURED_KEY}_${hoyEnArgentina()}`;

  try {
    const guardado = sessionStorage.getItem(clave);
    if (guardado) {
      const parsed = JSON.parse(guardado);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // sessionStorage no disponible o JSON corrupto: se pide por red, como antes.
  }

  const { data } = await api.get("/catalog/featured");
  const results = Array.isArray(data?.data) ? data.data : [];

  try {
    // Sólo se guarda si hay algo: cachear una lista vacía dejaría la home sin
    // recomendación hasta la medianoche por un fallo puntual del server.
    if (results.length > 0) sessionStorage.setItem(clave, JSON.stringify(results));
  } catch {
    // Cuota llena o modo privado: el caché es una mejora, no un requisito.
  }

  return results;
};

/**
 * Precio comunitario de un vino (promedio de lo que pagó la gente).
 * Devuelve { avg, count, min, max, currency } o null.
 */
export const getWinePrice = async (name, winery, varietal = "") => {
  const { data } = await api.get("/catalog/price", { params: { name, winery, varietal } });
  return data?.data || null;
};

// URL de búsqueda del vino en MercadoLibre (siempre actual, sin API).
// Lleva la uva: el nombre visible ya no la incluye y "Saint Felicien" a secas
// devuelve las cuatro uvas de la línea mezcladas.
export const mercadoLibreUrl = (name, winery, varietal = "") => {
  const q = [name, varietal, winery].filter(Boolean).join(" ");
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
 * Un plato con receta para acompañar la botella, según el plan de la noche.
 * Se pide sólo cuando el usuario la pide: es la única parte del "plan de la
 * noche" que cuesta una llamada. El server la cachea por vino + plan.
 */
export const getWineRecipe = async (wine, plan) => {
  const { data } = await api.post("/catalog/recipe", {
    name: wine.name,
    winery: wine.winery,
    varietal: wine.varietal,
    type: wine.type,
    region: wine.region,
    plan,
  });
  return data?.data || null;
};

/**
 * Traduce un plato escrito a mano ("risotto de hongos") a una categoría de
 * maridaje. Sólo se llama cuando la tabla local del cliente no lo reconoció.
 */
export const classifyDish = async (dish) => {
  const { data } = await api.post("/catalog/pairing", { dish });
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
