/**
 * Normalización para comparar texto escrito por personas.
 *
 * Vivía duplicada dentro de BodyPage. La necesitan también el Sommelier (para
 * saber si un vino del catálogo ya está en tu bodega) y cualquier pantalla que
 * compare nombres, así que vive acá: si mañana hay que contemplar la "ñ" o los
 * guiones, se cambia en un solo lugar.
 */
export const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Clave laxa para reconocer el mismo vino entre distintas fuentes. */
export const wineKey = (wine) =>
  `${normalizeSearchText(wine?.name || "")}|${normalizeSearchText(wine?.winery || "")}`;
