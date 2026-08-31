// Identidad de un vino: bodega + línea + varietal + nombre propio.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El catálogo () siempre tuvo los campos SEPARADOS: sus filas
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
// El vocabulario de uvas vive entero en data/grapes.js. Acá sólo se usa la
// operación que corresponde a una clave: llevar la uva a su forma canónica.
const { canonicalGrape } = require("./grapes");

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
  OJO: "Reserva", "Gran Reserva", "Roble", "Selección", "Premium", "Cosecha Tardía" y
  similares NO son nombres propios: son la línea o la categoría, y van en "line".
  Tampoco es un nombre propio la uva ni una palabra que ya escribiste en otro campo.

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
/**
 * ── LAS GAMAS QUE NO NOMBRAN NADA ───────────────────────────────────────────
 *
 * "Reserva" no es el nombre de un vino: es la gama, y la usan decenas de
 * bodegas. Un Norton Reserva escaneado se guardaba con nombre "Reserva" —así,
 * solo— porque el nombre visible salía de la línea y la línea decía eso. La
 * convención de campos de arriba lo pide bien (la gama va en `line`), pero el
 * nombre visible no puede ser esa gama a secas: en la bodega quedaba una fila
 * llamada "Reserva", indistinguible del Trapiche Reserva de al lado, y ese
 * mismo string es el que viaja al catálogo compartido y a los pools de fotos.
 *
 * Cuando el vino se llama SÓLO así, el nombre se completa con la bodega
 * ("Norton Reserva", "Rutini Single Vineyard"), que es como lo nombra
 * cualquiera que lo tenga en la mano. Una línea que no está en esta lista es
 * distintiva —"Saint Felicien", "Broquel", "Angélica Zapata"— y va sola.
 *
 * Debe ser idéntica a la del cliente (client/src/utils/wineIdentity.js).
 */
const GENERIC_LINES = new Set([
  "reserva", "reservas", "reserve", "gran reserva", "grand reserve",
  "clasico", "clasica", "classic", "tradicional", "tradicion",
  "roble", "oak", "barrica", "crianza",
  "seleccion", "seleccionado", "selection", "selected",
  "estate", "varietal", "varietales", "premium", "superior", "especial",
  "single vineyard", "vinedo unico",
  "cosecha tardia", "late harvest",
  "coleccion", "collection", "edicion limitada", "limited edition",
  "vinas viejas", "old vine", "old vines",
  "gran corte", "corte",
  "brut", "extra brut", "brut nature", "nature", "demi sec", "dulce natural",
]);

const isGenericLine = (line) => GENERIC_LINES.has(fold(line).replace(/\s+/g, " ").trim());

/**
 * La bodega como se escribe DELANTE del vino.
 *
 * Distinta de `canonicalWinery`, que existe para claves y devuelve texto
 * plegado (sin acentos, en minúscula). Ésta conserva cómo se escribe, porque
 * su resultado se muestra: "Bodega Norton" → "Norton", para que el nombre
 * quede "Norton Reserva" y no "Bodega Norton Reserva", que no lo dice nadie.
 */
const WINERY_PREFIX_DISPLAY = /^(bodegas?\s+y\s+vi[nñ]edos|bodegas?|vi[nñ]edos|vi[nñ]as?)\s+/i;
const WINERY_SUFFIX_DISPLAY = /\s+(wines?|winery|vineyards?|estate|s\.?\s?a\.?|s\.?r\.?l\.?)$/i;

const displayWinery = (winery = "") => {
  const base = String(winery || "").trim();
  if (!base) return "";
  const limpio = base.replace(WINERY_PREFIX_DISPLAY, "").replace(WINERY_SUFFIX_DISPLAY, "").trim();
  return limpio.length >= 3 ? limpio : base;
};

const composeDisplayName = ({ name, line, winery } = {}) => {
  const propio = String(name || "").trim();
  if (propio) return propio;

  const gama = String(line || "").trim();
  if (!gama || !isGenericLine(gama)) return gama;

  const bodega = displayWinery(winery);
  if (!bodega) return gama;
  // La línea ya la trae ("Norton Reserva" leído entero como línea).
  if (fold(gama).includes(fold(bodega))) return gama;
  return `${bodega} ${gama}`;
};

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
 * ── LA MISMA BOTELLA, ESCRITA DE DOS MANERAS ────────────────────────────────
 *
 * Todo lo de abajo existe por un caso concreto: el mismo Pispi de Mosquita
 * Muerta, escaneado dos veces, terminó como DOS filas del catálogo público, cada
 * una con su foto. No fue un error de lectura —las dos lecturas eran correctas—:
 * fue que la etiqueta se puede transcribir de más de una forma y la clave tomaba
 * los campos crudos.
 *
 *   escaneo 1 → winery "Mosquita Muerta Wines", varietal "Blend"
 *   escaneo 2 → winery "Mosquita Muerta",       varietal "Blend de tintas"
 *
 * Ninguna de las dos está mal. La bodega se firma con y sin "Wines" según dónde
 * mires la etiqueta, y un corte de tintas es un blend lo escriba como lo escriba
 * quien lo lea. Pero como la clave era `nombre+uva|bodega` con los strings tal
 * cual venían, esas dos lecturas producían claves distintas, y con eso:
 *
 *   - dos filas en el catálogo comunitario, las dos publicadas;
 *   - el pool de fotos partido, cada mitad con una foto de la misma botella;
 *   - el precio y las reseñas repartidos entre dos vinos que son uno;
 *   - y `isCuratedWine` diciendo que no, cuando el vino SÍ está en el catálogo
 *     curado ("Mosquita Muerta Wines / Pispi / Blend"), así que la fila
 *     comunitaria nunca se frenó.
 *
 * La normalización vive acá y sólo toca las CLAVES. Lo que se muestra sigue
 * siendo lo que dice la etiqueta: si tu botella dice "Blend de tintas", tu ficha
 * dice "Blend de tintas". Lo que se unifica es la identidad con la que ese vino
 * se cruza contra los demás.
 */

/**
 * La bodega, sin lo que no la identifica.
 *
 * "Mosquita Muerta" y "Mosquita Muerta Wines" son la misma bodega; "Norton" y
 * "Bodega Norton" también. Cuál de las dos formas queda depende de dónde mire la
 * etiqueta quien la lea, así que ninguna puede ser LA clave.
 *
 * Se sacan sólo los tokens societarios —los que acompañan a cualquier bodega y
 * por eso no distinguen a ninguna—. El resto del nombre no se toca: "Finca" y
 * "Familia" se quedan, porque ahí sí son parte del nombre propio ("Finca Las
 * Moras" no es "Las Moras" para nadie).
 *
 * De paso arregla un bug que estaba a la vista en `identityKey`: la bodega se
 * truncaba al primer token, así que las 24 bodegas del catálogo que empiezan con
 * "Bodega" —Norton, Chacra, Colomé, Garzón…— compartían el token "bodega" entre
 * sí y ninguna coincidía con la lectura que dijera sólo "Norton".
 */
const WINERY_PREFIX = /^(bodegas?\s+y\s+vinedos|bodegas?|vinedos|vinas?)\s+/;
const WINERY_SUFFIX =
  /\s+(wines?|winery|wine\s+estate|vineyards?|vinedos|estate|s\.?\s?a\.?|s\.?r\.?l\.?|e\s+hijos|y\s+cia)$/;

const canonicalWinery = (winery = "") => {
  const base = fold(winery);
  if (!base) return "";
  let out = base.replace(WINERY_PREFIX, "").replace(WINERY_SUFFIX, "").trim();
  // Si limpiar la deja irreconocible, la bodega ERA ese token: "Bodega Chandon"
  // pierde el prefijo y queda "chandon", pero una llamada "Bodegas" a secas no
  // puede quedar en la nada.
  if (out.length < 3) return base;
  return out;
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
 *
 * Los dos campos pasan por su forma canónica (ver arriba): es lo que hace que
 * "Pispi / Mosquita Muerta Wines / Blend" y "PISPI / Mosquita Muerta / Blend de
 * tintas" sean una sola botella y no dos.
 */
const poolKey = (name, winery, varietal = "") => {
  let core = fold(composeSearchName({ name, varietal: canonicalGrape(varietal) }));
  const bodega = canonicalWinery(winery);

  /**
   * La bodega no entra en el core: ya está del otro lado de la barra.
   *
   * Sacarla es lo que hace que la MISMA botella caiga en el mismo pool aunque
   * su nombre se haya guardado con dos convenciones distintas. El Norton
   * Reserva cargado antes de que el nombre se completara con la bodega quedó
   * como "Reserva"; el de hoy queda como "Norton Reserva". Sin esto serían dos
   * pools —dos veces la misma foto, el precio partido al medio— por un cambio
   * que sólo afecta a cómo se escribe el nombre, no a qué botella es.
   */
  if (bodega && core.startsWith(`${bodega} `)) {
    core = core.slice(bodega.length + 1).trim();
  }

  if (core.length < 3) return null;
  return `${core}|${bodega}`;
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
  // Dos formas de la uva, para dos usos distintos. La CRUDA es la que hay que
  // sacar del nombre —si la etiqueta se guardó como "Pispi Blend de tintas", lo
  // que sobra del nombre es ese texto y no el canónico—; la CANÓNICA es la que
  // entra en la clave, para que "Blend" y "Blend de tintas" no sean dos vinos.
  const varietalRaw = fold(wine.varietal || "");
  const varietal = fold(canonicalGrape(wine.varietal || ""));
  const explicit = fold(wine.line || "") || fold(wine.name === wine.line ? "" : wine.properName || "");

  let core = explicit;
  if (!core) {
    core = fold(wine.name || "");
    for (const uva of [varietalRaw, varietal]) {
      if (uva && core.includes(uva)) {
        core = core.replace(uva, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  // La bodega se trunca al primer token a propósito: las fuentes externas dicen
  // "Catena" donde el catálogo dice "Catena Zapata". Se trunca sobre la forma
  // canónica, no sobre el texto crudo: si no, "Bodega Norton" aporta el token
  // "bodega", que no identifica a ninguna bodega en particular y no coincide con
  // la lectura que dijo sólo "Norton".
  const wineryToken = canonicalWinery(wine.winery || "").split(/\s+/)[0] || "";
  return { core, varietal, wineryToken };
};

module.exports = {
  FIELD_CONVENTION,
  // Se re-exporta por comodidad de quien ya trabaja con identidades; la fuente
  // es data/grapes.js.
  canonicalGrape,
  canonicalWinery,
  composeDisplayName,
  composeSearchName,
  identityKey,
  poolKey,
};
