// Coherencia de una identificación de vino, y qué se puede hacer con ella.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
// Hasta acá la confianza que devolvía el modelo se usaba SÓLO para decidir si la
// pantalla de revisión dibujaba un chip o un input, y moría en el navegador. El
// servidor, en el momento exacto de decidir si un vino entra al catálogo público
// —el dato que después ve cualquier otra persona—, no sabía si venía de una foto
// nítida, de una adivinanza o de alguien tipeando.
//
// Y nadie miraba si los campos se contradecían entre sí. Un varietal "Blen"
// (un "Blend" al que el modelo le comió la última letra) llegaba a la ficha, a
// la tarjeta de búsqueda y al catálogo compartido sin que nada chistara, porque
// la única validación era "es un string no vacío".
//
// Acá viven las dos cosas: qué está mal en una lectura (`checkCoherence`) y qué
// se puede hacer con ella (`identificationVerdict`). Es un módulo de datos puro
// —sin red, sin base— para poder testearlo entero y para que lo pueda usar tanto
// el alta como la edición.
//
// El espejo del cliente vive en client/src/utils/wineValidation.js. Ver la nota
// sobre la asimetría deliberada entre los dos vocabularios al final del archivo.

const { CATALOG, fold } = require("./argentineWines");
const { composeDisplayName } = require("./wineIdentity");

// Mismos umbrales que usa la pantalla de revisión para pintar los campos. Están
// acá además de en el cliente porque acá es donde deciden algo irreversible.
const CONFIDENCE = { TRUSTED: 80, REVIEW: 50 };

// Uvas de referencia, con el color que implican. Se usa para dos cosas: saber si
// un varietal leído existe, y detectar un tipo que lo contradiga.
const GRAPE_COLOR = {
  malbec: "red",
  "cabernet sauvignon": "red",
  "cabernet franc": "red",
  merlot: "red",
  syrah: "red",
  "pinot noir": "red",
  bonarda: "red",
  tempranillo: "red",
  "petit verdot": "red",
  tannat: "red",
  sangiovese: "red",
  "petit syrah": "red",
  criolla: "red",
  chardonnay: "white",
  "sauvignon blanc": "white",
  "torrontes": "white",
  semillon: "white",
  viognier: "white",
  "chenin blanc": "white",
  gewurztraminer: "white",
  "pinot grigio": "white",
  riesling: "white",
  albarino: "white",
  moscato: "white",
  "pedro gimenez": "white",
};

/**
 * El vocabulario de uvas aceptadas.
 *
 * Sale de dos fuentes que se suman: la tabla de arriba y TODOS los varietales
 * que aparecen en el catálogo curado. Lo segundo es lo que hace que esto no haya
 * que mantenerlo a mano: el catálogo ya tiene "Gran Corte", "Blend de Blancs",
 * "Barrel Blend" y demás nombres de corte que ninguna lista canónica de uvas
 * incluiría, y son válidos justamente porque están impresos en botellas reales
 * que ya verificamos.
 */
const buildVocabulary = () => {
  const set = new Set(Object.keys(GRAPE_COLOR));
  for (const nombre of ["blend", "corte", "gran corte", "blend blanco", "white blend"]) {
    set.add(nombre);
  }
  for (const fila of CATALOG) {
    const v = fold(fila.varietal || "");
    if (v) set.add(v);
  }
  return set;
};

let vocabulario = null;
const getVocabulary = () => {
  if (!vocabulario) vocabulario = buildVocabulary();
  return vocabulario;
};

/**
 * Distancia de edición acotada.
 *
 * Hay otra igual en catalog.service.js, y se queda ahí: este módulo es de datos
 * puros y no puede depender de un servicio que arrastra Gemini y Open Food Facts
 * sólo para reusar doce líneas. Son doce líneas.
 */
const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
};

/**
 * El varietal leído, llevado a su forma canónica.
 *
 * Devuelve `{ value, corrected, known }`:
 *  - coincide con el vocabulario → se devuelve tal cual, `known: true`.
 *  - está a UNA letra de algo del vocabulario (y mide 4 o más) → se corrige.
 *    Es el caso "Blen" → "Blend" y "Malbek" → "Malbec": una letra de distancia
 *    no es otra uva, es un carácter que se perdió entre el relieve de la etiqueta
 *    y el modelo. Corregirlo es estrictamente mejor que guardar la palabra rota.
 *
 *    El piso de 4 caracteres es lo que impide que esto se vuelva peligroso: no
 *    hay uvas de tres letras, así que una palabra más corta que eso no es un
 *    varietal con un error sino ruido, y adivinarle una uva sería inventar.
 *  - no se parece a nada → se devuelve tal cual con `known: false`. NO se borra:
 *    puede ser una uva real que no tenemos listada, y perder el dato del usuario
 *    sería peor que marcarlo como no reconocido. Lo que sí hace es bajarle la
 *    confianza y, con eso, frenar la publicación.
 */
const canonicalVarietal = (raw = "") => {
  const original = String(raw || "").trim();
  if (!original) return { value: "", corrected: false, known: true };

  const objetivo = fold(original);
  const vocab = getVocabulary();
  if (vocab.has(objetivo)) return { value: original, corrected: false, known: true };

  if (objetivo.length >= 4) {
    for (const candidato of vocab) {
      if (Math.abs(candidato.length - objetivo.length) > 1) continue;
      if (editDistance(objetivo, candidato, 1) <= 1) {
        // Se devuelve capitalizado como se escribe, no como se folded.
        const bonito = candidato
          .split(" ")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" ");
        return { value: bonito, corrected: true, known: true };
      }
    }
  }

  return { value: original, corrected: false, known: false };
};

/** El color que implica una uva, o "" si no lo sabemos o es un corte. */
const grapeColor = (varietal = "") => GRAPE_COLOR[fold(varietal)] || "";

/**
 * Qué está mal en esta lectura.
 *
 * Devuelve códigos, no frases: quién los muestra decide cómo se leen (el
 * cliente tiene los textos). Los dos primeros son BLOQUEANTES — no describen un
 * dato dudoso sino una identidad que no existe.
 */
const BLOCKING_ISSUES = new Set(["sin-nombre", "nombre-es-bodega"]);

const checkCoherence = (values = {}) => {
  const issues = [];

  const nombre = composeDisplayName(values);
  const bodega = String(values.winery || "").trim();
  const varietal = String(values.varietal || "").trim();

  // 1. Sin nombre ni línea no hay vino que nombrar. Antes esto no era un problema
  //    porque el nombre caía a la bodega; ahora que no cae, es visible.
  if (!nombre) issues.push("sin-nombre");

  // 2. El nombre ES la bodega. Es el error "Pispi": dos campos distintos con el
  //    mismo contenido significa que uno de los dos está mal, y no sabemos cuál.
  //    Se salta cuando el vino de verdad se llama como su bodega (existe: "Clos
  //    de los Siete", "Cheval des Andes") y eso lo confirma el catálogo curado.
  else if (bodega && fold(nombre) === fold(bodega) && !nombreIgualALaBodegaEsLegitimo(nombre)) {
    issues.push("nombre-es-bodega");
  }

  // 3. Uva que no reconocemos.
  if (varietal && !canonicalVarietal(varietal).known) issues.push("varietal-desconocido");

  // 4. Tipo que contradice a la uva. Sólo se marcan las contradicciones DURAS:
  //    un espumante de Pinot Noir y un rosado de Malbec son botellas normales, así
  //    que sparkling/rosé/fortified nunca contradicen nada. Un tinto de Torrontés
  //    o un blanco de Malbec, en cambio, no existen.
  const color = grapeColor(varietal);
  const tipo = String(values.type || "unknown").trim();
  if (color === "red" && tipo === "white") issues.push("tipo-incoherente");
  if (color === "white" && tipo === "red") issues.push("tipo-incoherente");

  // 5. Cosecha imposible. `vision.service` ya acota lo que devuelve el modelo,
  //    pero por acá también entra lo que escribe una persona.
  const year = Number.parseInt(values.vintage, 10);
  if (values.vintage !== "" && values.vintage !== undefined && values.vintage !== null) {
    const max = new Date().getFullYear() + 1;
    if (!Number.isFinite(year) || year < 1900 || year > max) issues.push("cosecha-implausible");
  }

  return issues;
};

// Vinos que legítimamente se llaman igual que su bodega. Se resuelve contra el
// catálogo curado y no con una lista aparte: si mañana se agrega otro, esto lo
// sabe solo.
let nombresIgualesABodega = null;
function nombreIgualALaBodegaEsLegitimo(nombre) {
  if (!nombresIgualesABodega) {
    nombresIgualesABodega = new Set(
      CATALOG.filter((w) => fold(w.name) === fold(w.winery)).map((w) => fold(w.name))
    );
  }
  return nombresIgualesABodega.has(fold(nombre));
}

/**
 * Qué se puede hacer con esta identificación.
 *
 *   "trusted"    → entra a la bodega y PUEDE aportar al catálogo público.
 *   "unverified" → entra a la bodega y NO aporta, hasta que una segunda persona
 *                  cargue lo mismo de forma independiente.
 *   "doubtful"   → la revisión pide confirmar o corregir antes de guardar.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * Un campo que el usuario ESCRIBIÓ vale 100: nadie tipea el nombre de una bodega
 * por accidente, y es la señal más fuerte que tenemos. Un campo que el modelo
 * leyó vale lo que el modelo dijo que valía. Lo que decide es el par
 * nombre + bodega, que es la identidad del vino; el resto de los campos puede
 * estar incompleto sin que eso sea motivo para dudar de cuál botella es.
 *
 * Que falte la bodega no vuelve dudosa la lectura —el nombre solo ya identifica
 * bastante— pero sí impide publicar: media identidad no alcanza para un catálogo
 * que después consulta otra gente.
 */
const identificationVerdict = ({
  values = {},
  confidence = {},
  editedFields = [],
  source = "",
  issues = null,
} = {}) => {
  const problemas = issues || checkCoherence(values);
  const editados = new Set(editedFields || []);
  const esManual = source === "manual";

  // Cuánta confianza le damos a un campo, ya contando quién lo puso ahí.
  const confDe = (campo) => {
    if (editados.has(campo)) return 100;
    // En carga manual TODO lo que está escrito lo escribió la persona.
    if (esManual) return String(values[campo] || "").trim() ? 100 : 0;
    const n = Number(confidence[campo]);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  };

  // El nombre puede venir del nombre propio o de la línea: vale el mejor de los
  // dos, porque cualquiera de los dos alcanza para nombrar la botella.
  const confNombre = Math.max(confDe("name"), confDe("line"));
  const confBodega = confDe("winery");

  const bloqueante = problemas.some((i) => BLOCKING_ISSUES.has(i));
  if (bloqueante || confNombre < CONFIDENCE.REVIEW) return "doubtful";

  if (
    problemas.length === 0 &&
    confNombre >= CONFIDENCE.TRUSTED &&
    confBodega >= CONFIDENCE.TRUSTED
  ) {
    return "trusted";
  }

  return "unverified";
};

/** Los campos que la revisión tiene que abrir sí o sí para cada problema. */
const FIELDS_FOR_ISSUE = {
  "sin-nombre": ["line", "properName"],
  "nombre-es-bodega": ["line", "properName", "winery"],
  "varietal-desconocido": ["varietal"],
  "tipo-incoherente": ["varietal"],
  "cosecha-implausible": ["vintage"],
};

module.exports = {
  CONFIDENCE,
  BLOCKING_ISSUES,
  FIELDS_FOR_ISSUE,
  canonicalVarietal,
  grapeColor,
  checkCoherence,
  identificationVerdict,
};
