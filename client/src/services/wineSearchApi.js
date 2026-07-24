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
