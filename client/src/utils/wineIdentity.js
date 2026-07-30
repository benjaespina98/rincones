// Espejo cliente de server/src/data/wineIdentity.js.
//
// Se duplica a propósito: componer el nombre visible es puro string y no vale
// un viaje de red en el camino crítico del escaneo. Si cambiás la regla acá,
// cambiala también allá — las dos tienen que producir el mismo string, porque
// ese nombre es la clave con la que se comparten fotos, precios y descripciones.

/**
 * El nombre visible NO lleva la uva: el vino se llama "Saint Felicien", que sea
 * Malbec ya lo dice su propio chip. La uva sigue siendo campo propio y sigue
 * entrando en la búsqueda; ver `wineSearchName`.
 */
export const composeDisplayName = ({ name, line, winery } = {}) => {
  const head = String(name || "").trim() || String(line || "").trim();
  return head || String(winery || "").trim();
};

/**
 * El nombre de un vino GUARDADO, listo para mostrar.
 *
 * Los vinos cargados antes de este cambio tienen la uva pegada al nombre
 * ("Álamos Cabernet Sauvignon"), porque así se componía. Esto la saca al
 * momento de dibujar, así que la pantalla se ve bien SIN depender de que la
 * migración haya corrido: el nombre correcto no puede quedar sujeto a un script
 * que alguien tiene que acordarse de ejecutar.
 *
 * Se compara por TOKENS y no por substring, que es la diferencia entre hacerlo
 * bien y romper nombres: recortando caracteres a ojo, "Álamos Cabernet
 * Sauvignon" con la uva guardada como "Sauvignon" quedaría en "Álamos Cabernet".
 *
 * Sólo saca la uva si queda algo después: un vino que se llama únicamente
 * "Malbec" conserva su nombre, porque vaciarlo lo dejaría sin ninguno.
 */
export const wineDisplayName = (wine = {}) => {
  const nombre = String(wine.name || "").trim();
  const uva = String(wine.varietal || "").trim();
  if (!nombre || !uva) return nombre;

  const tn = nombre.split(/\s+/);
  const tu = uva.split(/\s+/);
  if (tn.length <= tu.length) return nombre;

  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (fold(tn.slice(-tu.length).join(" ")) !== fold(uva)) return nombre;

  return tn.slice(0, -tu.length).join(" ").trim() || nombre;
};

/** El nombre como se busca, que sí incluye la uva ("Saint Felicien Malbec"). */
export const composeSearchName = ({ name, line, varietal, winery } = {}) => {
  const head = composeDisplayName({ name, line, winery });
  const grape = String(varietal || "").trim();
  if (!grape) return head;
  if (head.toLowerCase().includes(grape.toLowerCase())) return head;
  return [head, grape].filter(Boolean).join(" ").trim();
};

// Espejo de guessType() en server/src/services/catalog.service.js.
// Sirve para no preguntarle al usuario el tipo de vino cuando ya escribió la uva.
export const guessWineType = (text = "") => {
  const t = String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/(sparkl|espumante|champagne|prosecco|cava|spumante|brut)/.test(t)) return "sparkling";
  if (/(rose|rosado)/.test(t)) return "rosé";
  if (/(white|blanc|blanco|chardonnay|sauvignon|riesling|torront)/.test(t)) return "white";
  if (/(port|sherry|fortif|oporto|jerez)/.test(t)) return "fortified";
  if (/(red|tinto|rouge|malbec|cabernet|merlot|syrah|tempranillo|pinot noir|bonarda)/.test(t))
    return "red";
  return "unknown";
};

// Umbrales de confianza por campo (0-100), en un solo lugar.
//  >= 80  lo damos por bueno y lo mostramos como dato
//  50-79  lo usamos, pero pedimos que lo verifiquen
//  < 50   no lo adoptamos: lo ofrecemos como sugerencia
export const CONFIDENCE = { TRUSTED: 80, REVIEW: 50 };

export const confidenceLevel = (score) => {
  const n = Number(score) || 0;
  if (n >= CONFIDENCE.TRUSTED) return "trusted";
  if (n >= CONFIDENCE.REVIEW) return "review";
  return "low";
};
