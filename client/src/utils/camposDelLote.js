/**
 * Los cambios de una edición en lote: sólo lo que la persona completó, con los nombres que espera
 * el servidor. Lo que queda vacío NO se toca (vacío no significa "borrar": cada vino conserva lo
 * suyo), y "No cambiar" en el tipo tampoco.
 */
export const camposDelLote = ({ type, region, cellarLocation } = {}) => {
  const cambios = {};
  if (type && type !== "keep") cambios.type = type;
  if (String(region || "").trim()) cambios.region = String(region).trim();
  if (String(cellarLocation || "").trim()) cambios.cellarLocation = String(cellarLocation).trim();
  return cambios;
};
