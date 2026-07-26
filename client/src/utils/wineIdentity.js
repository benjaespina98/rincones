// Espejo cliente de server/src/data/wineIdentity.js.
//
// Se duplica a propósito: componer el nombre visible es puro string y no vale
// un viaje de red en el camino crítico del escaneo. Si cambiás la regla acá,
// cambiala también allá — las dos tienen que producir el mismo string, porque
// ese nombre es la clave con la que se comparten fotos, precios y descripciones.

export const composeDisplayName = ({ name, line, varietal, winery } = {}) => {
  const head = String(name || "").trim() || String(line || "").trim();
  const grape = String(varietal || "").trim();
  const composed = [head, grape].filter(Boolean).join(" ").trim();
  return composed || String(winery || "").trim();
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
