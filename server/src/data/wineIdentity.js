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
 * Nombre visible del vino: la línea o el nombre propio, SIN la uva.
 *
 * El vino se llama "Saint Felicien"; que sea Malbec es otra cosa —una que la
 * ficha ya muestra en su propio chip, al lado del tipo y la cosecha—. Meterla
 * en el nombre la decía dos veces y hacía que la etiqueta de la bodega leyera
 * como un renglón de catálogo en vez de como el nombre de una botella.
 *
 * La uva NO se pierde en ningún lado que importe: sigue siendo campo propio,
 * entra en el índice de búsqueda (buscar "Saint Felicien Malbec" encuentra el
 * vino) y forma parte de la identidad para deduplicar y para las claves de los
 * pools compartidos. Para eso están `composeSearchName` y `poolKey`.
 *
 * ── POR QUÉ NO CAE A LA BODEGA ──────────────────────────────────────────────
 * Antes, sin nombre ni línea, devolvía la bodega. Parecía una degradación
 * amable —"mejor eso que una tarjeta sin nombre"— y era el bug de identidad más
 * caro que tuvimos: cuando la visión leía "Pispi" como bodega (el nombre de
 * fantasía suele ser lo más grande de la etiqueta, y la bodega —Mosquita
 * Muerta— va chica abajo), este fallback lo copiaba también al nombre. El vino
 * quedaba guardado como `{ name: "Pispi", winery: "Pispi" }` y de ahí pasaba al
 * catálogo público, donde ya no era el error de una persona.
 *
 * Un vino del que sólo sabemos la bodega NO tiene nombre, y decirlo vacío es lo
 * único cierto: quien decide qué hacer con eso es la pantalla de revisión, que
 * ahora lo pide. Colapsar dos campos distintos en uno no es una degradación
 * amable, es inventar un dato.
 *
 * Debe producir EXACTAMENTE lo mismo que compone argentineWines.js.
 */
const composeDisplayName = ({ name, line } = {}) =>
  String(name || "").trim() || String(line || "").trim();

/**
 * El nombre como se BUSCA, que sí incluye la uva: nadie escribe "Saint
 * Felicien" a secas cuando está buscando el Malbec. Es lo que se le manda a las
 * fuentes externas y al catálogo, no lo que se muestra en pantalla.
 *
 * Acá la bodega SÍ es un respaldo válido, y es la diferencia con el nombre
 * visible: "Salentein" es una búsqueda perfectamente sensata —te trae lo que esa
 * bodega hace— mientras que "Salentein" como NOMBRE de una botella es un dato
 * falso. Buscar de más no le miente a nadie; nombrar de más, sí.
 */
const composeSearchName = ({ name, line, varietal, winery } = {}) => {
  const head = composeDisplayName({ name, line }) || String(winery || "").trim();
  const grape = String(varietal || "").trim();
  if (!grape) return head;
  if (fold(head).includes(fold(grape))) return head;
  return [head, grape].filter(Boolean).join(" ").trim();
};

/**
 * Clave de los pools compartidos entre usuarios (fotos, precios, catálogo
 * comunitario): nombre + uva + bodega.
 *
 * La uva es parte de la clave y no un adorno: "Saint Felicien Malbec" y "Saint
 * Felicien Cabernet Sauvignon" son botellas distintas y no pueden compartir la
 * foto ni el precio.
 *
 * Se agrega sólo si el nombre no la trae ya. Eso hace que la clave sea la MISMA
 * que generaban los nombres viejos —que incluían la uva—, así que sacarla del
 * nombre visible no parte los pools en dos ni deja huérfano lo ya aportado.
 */
const poolKey = (name, winery, varietal = "") => {
  const core = fold(composeSearchName({ name, varietal }));
  if (core.length < 3) return null;
  return `${core}|${fold(winery)}`;
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

module.exports = {
  FIELD_CONVENTION,
  composeDisplayName,
  composeSearchName,
  identityKey,
  poolKey,
};
