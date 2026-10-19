// Espejo cliente de server/src/data/wineIdentity.js.
//
// Se duplica a propósito: componer el nombre visible es puro string y no vale
// un viaje de red en el camino crítico del escaneo. Si cambiás la regla acá,
// cambiala también allá — las dos tienen que producir el mismo string, porque
// ese nombre es la clave con la que se comparten fotos, precios y descripciones.

const fold = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * ── LAS GAMAS QUE NO NOMBRAN NADA ───────────────────────────────────────────
 *
 * "Reserva" no es el nombre de un vino: es la gama, y la usan decenas de
 * bodegas. Un Norton Reserva escaneado se guardaba con nombre "Reserva" —así,
 * solo— porque el nombre visible salía de la línea y la línea decía eso. En la
 * bodega quedaba una fila llamada "Reserva", imposible de distinguir del
 * Trapiche Reserva de al lado, y ese mismo string viajaba al catálogo
 * compartido.
 *
 * Estas son las gamas genéricas: cuando el vino se llama SÓLO así, el nombre se
 * completa con la bodega ("Norton Reserva", "Rutini Single Vineyard"), que es
 * como lo nombra cualquiera que lo tenga en la mano. Una línea que no está en
 * esta lista es distintiva —"Saint Felicien", "Broquel", "Angélica Zapata"— y
 * va sola, porque agregarle la bodega adelante la diría dos veces.
 *
 * Debe ser idéntica a la del servidor (server/src/data/wineIdentity.js).
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

export const isGenericLine = (line) => GENERIC_LINES.has(fold(line));

/**
 * La bodega como se escribe delante del vino.
 *
 * "Bodega Norton Reserva" no lo dice nadie: se dice "Norton Reserva". Se sacan
 * los tokens societarios —los que acompañan a cualquier bodega y no distinguen
 * a ninguna—. "Finca" y "Familia" se quedan: ahí sí son parte del nombre
 * ("Finca La Celia" no es "La Celia" para nadie).
 */
const WINERY_PREFIX = /^(bodegas?\s+y\s+vi[nñ]edos|bodegas?|vi[nñ]edos|vi[nñ]as?)\s+/i;
const WINERY_SUFFIX = /\s+(wines?|winery|vineyards?|estate|s\.?\s?a\.?|s\.?r\.?l\.?)$/i;

export const displayWinery = (winery = "") => {
  const base = String(winery || "").trim();
  if (!base) return "";
  const limpio = base.replace(WINERY_PREFIX, "").replace(WINERY_SUFFIX, "").trim();
  // Si limpiarla la deja irreconocible, la bodega ERA ese token.
  return limpio.length >= 3 ? limpio : base;
};

/**
 * El nombre visible NO lleva la uva: el vino se llama "Saint Felicien", que sea
 * Malbec ya lo dice la línea de datos. La uva sigue siendo campo propio y sigue
 * entrando en la búsqueda; ver `composeSearchName`.
 *
 * Tampoco cae a la bodega SOLA. Sin nombre ni línea el vino NO tiene nombre, y
 * eso se devuelve vacío a propósito: el fallback a `winery` era lo que hacía que
 * una etiqueta leída como bodega "Pispi" terminara guardada con nombre "Pispi" y
 * bodega "Pispi" —dos campos distintos colapsados en uno— y de ahí pasara al
 * catálogo público. Ver el comentario largo en el archivo del servidor.
 *
 * Lo que SÍ hace ahora es completar una gama genérica con su bodega: ver
 * `GENERIC_LINES`. "Reserva" sin bodega adelante no nombra ninguna botella.
 */
export const composeDisplayName = ({ name, line, winery } = {}) => {
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
  const guardado = String(wine.name || "").trim();
  const uva = String(wine.varietal || "").trim();

  // Sacar la uva pegada al nombre (vinos cargados con la convención vieja).
  let nombre = guardado;
  if (nombre && uva) {
    const tn = nombre.split(/\s+/);
    const tu = uva.split(/\s+/);
    if (tn.length > tu.length && fold(tn.slice(-tu.length).join(" ")) === fold(uva)) {
      const resto = tn.slice(0, -tu.length);
      // "Rosado de Malbec" con uva Malbec NO se acorta a "Rosado de": si lo que queda termina en un
      // conector, la uva es parte del nombre y se deja como está.
      const termina = fold(resto[resto.length - 1] || "");
      const CONECTORES = new Set(["de", "del", "con", "y", "la", "el", "los", "las", "en", "al", "&"]);
      if (resto.length && !CONECTORES.has(termina)) nombre = resto.join(" ").trim() || nombre;
    }
  }

  /**
   * Completar la gama genérica con la bodega, al DIBUJAR.
   *
   * Los vinos que ya entraron con nombre "Reserva" —antes de que
   * `composeDisplayName` supiera completarlo— siguen guardados así. Componerlo
   * acá hace que la bodega se vea bien sin depender de una migración: el nombre
   * correcto no puede quedar sujeto a un script que alguien tiene que acordarse
   * de correr. Lo que se guardó no se toca; lo que se lee, sí.
   */
  if (nombre && isGenericLine(nombre)) {
    const bodega = displayWinery(wine.winery);
    if (bodega && !fold(nombre).includes(fold(bodega))) return `${bodega} ${nombre}`;
  }

  return nombre;
};

/**
 * El nombre como se busca, que sí incluye la uva ("Saint Felicien Malbec").
 *
 * Acá la bodega sí es un respaldo válido: buscar "Salentein" trae lo que esa
 * bodega hace, y eso no le miente a nadie. Nombrar una botella "Salentein"
 * cuando no sabemos cómo se llama, sí.
 */
export const composeSearchName = ({ name, line, varietal, winery } = {}) => {
  const head = composeDisplayName({ name, line, winery }) || String(winery || "").trim();
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
