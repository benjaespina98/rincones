// Identidad de un vino: bodega + línea + varietal + nombre propio.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El catálogo (argentineWines.js) siempre tuvo los campos SEPARADOS: sus filas
// son [bodega, línea, varietal, región, tipo]. Pero los dos lugares donde Gemini
// devuelve vinos (visión de etiqueta y búsqueda por texto) tenían instrucciones
// CONTRADICTORIAS para el campo `name`: uno pedía "sin la bodega" y el otro daba
// como ejemplo "Catena Alta Malbec" (que incluye bodega y varietal). Resultado:
// "Trapiche Reserva Malbec" salía distinto en cada foto, y la deduplicación de
// búsqueda tenía que compensarlo a fuerza de recortar substrings.
//
// Acá vive la convención UNA sola vez. Los dos prompts la interpolan, así que
// no pueden volver a divergir.

const { fold } = require("./argentineWines");

// Fragmento de prompt compartido. Se inyecta literal en visión y en búsqueda.
const FIELD_CONVENTION = `Separá la etiqueta en estos campos, que son EXCLUYENTES entre sí
(cada palabra va a UN solo campo; no repitas tokens):

- winery: la bodega o productor (ej: "Trapiche", "Catena Zapata", "Bodega Norton").
- line: la GAMA o línea que la bodega usa en varias uvas (ej: "Reserva", "Gran Reserva",
  "Broquel", "Alamos", "Saint Felicien", "Serie A", "Privada", "Estate", "Single Vineyard",
  "Roble", "Medalla", "Fond de Cave"). Vacío si la etiqueta sólo dice bodega + uva.
- varietal: la uva, con su nombre completo y bien escrito ("Cabernet Sauvignon", no "Cab. Sauv.").
  Si es un corte de varias uvas, poné "Blend".
- name: el nombre PROPIO del vino, sólo si es distinto de la bodega, de la línea y de la uva
  (ej: "Angélica Zapata", "Nicasia", "Antología", "Iscay", "Nosotros"). Vacío en cualquier otro caso.

Ejemplos:
- Etiqueta "Trapiche / Reserva / Malbec" → winery:"Trapiche", line:"Reserva", varietal:"Malbec", name:""
- Etiqueta "Catena Zapata / Angélica Zapata / Malbec" → winery:"Catena Zapata", line:"", varietal:"Malbec", name:"Angélica Zapata"
- Etiqueta "Bodega Norton / Privada" → winery:"Bodega Norton", line:"Privada", varietal:"Blend", name:""
- Etiqueta "Zuccardi Serie A Torrontés" → winery:"Zuccardi", line:"Serie A", varietal:"Torrontés", name:""`;

/**
 * Nombre visible del vino. Debe producir EXACTAMENTE lo mismo que compone
 * argentineWines.js ("<línea> <varietal>"), porque ese string es la clave con la
 * que se guardan fotos, precios y descripciones compartidas entre usuarios.
 */
const composeDisplayName = ({ name, line, varietal, winery } = {}) => {
  const head = String(name || "").trim() || String(line || "").trim();
  const grape = String(varietal || "").trim();
  const composed = [head, grape].filter(Boolean).join(" ").trim();
  return composed || String(winery || "").trim();
};

/**
 * Clave canónica para deduplicar entre fuentes.
 *
 * `core` sale de la línea (o del nombre propio) cuando existe. Para las fuentes
 * viejas que no tienen `line`, cae al comportamiento anterior — quitar el
 * varietal del nombre —, así el resultado es idéntico al de hoy para los datos
 * ya guardados y mejora a medida que `line` se propaga.
 */
const identityKey = (wine = {}) => {
  const varietal = fold(wine.varietal || "");
  const explicit = fold(wine.line || "") || fold(wine.name === wine.line ? "" : wine.properName || "");

  let core = explicit;
  if (!core) {
    core = fold(wine.name || "");
    if (varietal && core.includes(varietal)) {
      core = core.replace(varietal, " ").replace(/\s+/g, " ").trim();
    }
  }

  // La bodega se trunca al primer token a propósito: las fuentes externas dicen
  // "Catena" donde el catálogo dice "Catena Zapata".
  const wineryToken = fold(wine.winery || "").split(/\s+/)[0] || "";
  return { core, varietal, wineryToken };
};

module.exports = { FIELD_CONVENTION, composeDisplayName, identityKey };
