/**
 * Lo necesario para DESHACER una edición en lote.
 *
 * Antes de aplicar los cambios se guarda, por cada vino elegido, el valor que tenía en cada campo
 * que se va a tocar. Deshacer manda esos mismos valores de vuelta: así cada vino recupera lo SUYO
 * (no un valor común), que es lo que hace falta cuando se editaron vinos distintos a la vez.
 *
 * Un campo vacío se manda como "" (no como undefined): es la forma de decirle al servidor "dejalo
 * sin dato", y undefined sería "no lo toques", que no desharía nada.
 */

/** El valor actual de cada campo editable de un vino, con los nombres que usa el servidor. */
const valorActual = (wine, campo) => {
  if (campo === "type") return wine?.type || "unknown";
  if (campo === "region") return wine?.region || "";
  if (campo === "cellarLocation") return wine?.cellar?.location || "";
  return "";
};

/**
 * Foto de lo que se va a cambiar: `{ [id]: { campo: valorPrevio } }`, sólo para los vinos elegidos y
 * sólo para los campos que están en `cambios`.
 */
export const instantaneaPrevia = (wines, ids, cambios) => {
  const porId = new Map((Array.isArray(wines) ? wines : []).map((w) => [String(w._id), w]));
  const campos = Object.keys(cambios || {});
  const foto = {};
  for (const id of ids || []) {
    const wine = porId.get(String(id));
    if (!wine) continue;
    foto[id] = Object.fromEntries(campos.map((c) => [c, valorActual(wine, c)]));
  }
  return foto;
};
