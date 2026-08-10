// Todo lo que la app sabe sobre uvas, en un solo archivo.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
// Estaba repartido en tres lugares que no se conocían entre sí, y cada uno hacía
// una cosa distinta con el mismo dato:
//
//   vision.service.js    abreviaturas ("Cab Sauv" → "Cabernet Sauvignon"),
//                        aplicadas al LEER, o sea que cambiaban lo guardado.
//   wineValidation.js    el vocabulario de uvas válidas y la corrección de
//                        dedazos ("Blen" → "Blend").
//   wineIdentity.js      los sinónimos de corte ("Blend de tintas" → "Blend"),
//                        aplicados sólo a las CLAVES.
//
// Tres tablas que hay que mantener coherentes a mano es una que va a quedar
// vieja. Y ya había pasado: `vision` traducía "Corte" → "Blend" mientras el
// catálogo curado tenía un vino cuyo varietal ES "Corte", así que una etiqueta
// correcta se guardaba con otra palabra.
//
// ── LOS TRES TRABAJOS SIGUEN SIENDO TRES ────────────────────────────────────
// Unificar el vocabulario no es unificar las operaciones: son distintas y se
// aplican en momentos distintos. Lo que se unifica es DÓNDE se declara.
//
//   expandAbbreviation  al leer la etiqueta. Cambia lo que se guarda, así que
//                       sólo puede tocar formas que NO son palabras que una
//                       etiqueta diga en serio.
//   canonicalGrape      al armar una clave. No cambia nada de lo guardado: sólo
//                       hace que dos maneras de decir lo mismo se crucen contra
//                       la misma fila.
//   GRAPE_COLOR         para detectar un tipo que contradiga a la uva.
//
// La regla para agregar algo acá está escrita al lado de cada tabla.

const { fold } = require("./argentineWines");

/**
 * Uvas de referencia y el color que implican.
 *
 * Se usa para dos cosas: saber si un varietal leído existe, y detectar una
 * contradicción dura (un tinto de Torrontés no existe). Los cortes NO están:
 * un blend no implica color por sí mismo.
 */
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
  torrontes: "white",
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
 * ABREVIATURAS → el nombre completo.
 *
 * Se aplican al leer la etiqueta y por lo tanto CAMBIAN lo que se guarda. Por
 * eso la regla es estricta: sólo entra acá una forma corta que ninguna etiqueta
 * pueda estar diciendo en serio. "Cab Sauv" no es una palabra; "Corte" sí, y por
 * eso vive en la tabla de abajo, que no reescribe nada.
 */
const ABBREVIATIONS = {
  "cab sauv": "Cabernet Sauvignon",
  "cab. sauv.": "Cabernet Sauvignon",
  "cabernet sauv": "Cabernet Sauvignon",
  "cab franc": "Cabernet Franc",
  "cab. franc": "Cabernet Franc",
  "sauv blanc": "Sauvignon Blanc",
  "sauv. blanc": "Sauvignon Blanc",
  cs: "Cabernet Sauvignon",
  pv: "Petit Verdot",
};

/**
 * Las formas de decir "es un corte" que significan exactamente lo mismo.
 *
 * Tabla explícita y no una regex sobre "blend", y la diferencia importa: el
 * catálogo curado tiene "Gran Blend" (el corte alto de Rutini Apartado), "Blend
 * de Blancs" y "Barrel Blend", que son varietales DISTINTOS. Una regex los
 * fundiría a todos y haría que el Apartado comparta foto y precio con el corte
 * de entrada.
 *
 * Dos buckets porque el color no es un detalle: un corte de tintas y uno de
 * blancos no son la misma botella aunque los dos sean cortes.
 *
 * La regla para agregar: sólo si es la MISMA botella dicha de otra manera. Ante
 * la duda, no se agrega — el test `catalogSearch` verifica que ningún par de los
 * 410 vinos del catálogo termine compartiendo clave, así que un sinónimo de más
 * se pone rojo ahí.
 */
const BLEND_SYNONYMS = {
  Blend: [
    "blend",
    "blend de tintas",
    "blend de tinta",
    "blend tinto",
    "blend de uvas",
    "corte",
    "corte de tintas",
    "corte tinto",
    "red blend",
    "mezcla",
    "assemblage",
    "coupage",
    "multivarietal",
  ],
  "Blend Blanco": ["blend blanco", "white blend", "blend de blancos", "corte blanco"],
};

const GRAPE_ALIASES = new Map();
for (const [canonico, variantes] of Object.entries(BLEND_SYNONYMS)) {
  for (const v of variantes) GRAPE_ALIASES.set(v, canonico);
}

/**
 * Cortes con nombre propio que son varietales VÁLIDOS y no sinónimos de nada.
 *
 * La diferencia con la tabla de arriba es toda la gracia: "Blend de tintas" es
 * otra manera de decir "Blend", pero "Gran Corte" es la gama alta de una bodega
 * y "Barrel Blend" un corte criado en barrica. Nombran botellas distintas, así
 * que se reconocen como uva válida —para que la lectura no baje de confianza ni
 * frene la publicación— pero NO colapsan en el genérico.
 *
 * Casi todos salen solos del catálogo curado ("Gran Blend", "Blend de Blancs",
 * "Barrel Blend"). Acá van los que se leen en etiquetas reales y todavía no
 * tienen fila propia.
 */
const BLEND_STYLES = ["gran corte", "corte de guarda", "gran mezcla"];

/**
 * Expande una abreviatura y capitaliza prolijo. Para el momento de LEER.
 *
 * Lo que no está en la tabla vuelve con la capitalización arreglada y nada más:
 * no se traduce ni se adivina.
 */
const expandAbbreviation = (raw = "") => {
  const v = String(raw).trim();
  if (!v) return "";
  const low = v.toLowerCase().replace(/\s+/g, " ");
  if (ABBREVIATIONS[low]) return ABBREVIATIONS[low];
  return v
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
};

/**
 * La uva, llevada a la forma con la que entra en una CLAVE.
 *
 * No es para mostrar ni para guardar: el varietal que dice la etiqueta se
 * conserva tal cual en el vino y en la ficha. Esto sólo hace que dos maneras de
 * decir lo mismo se crucen contra la misma fila.
 *
 * Una uva que no está en la tabla vuelve intacta: el objetivo es unificar
 * sinónimos conocidos, no adivinar. Los dedazos son otro problema y los resuelve
 * `canonicalVarietal` en wineValidation.js, que corre antes, en el alta.
 */
const canonicalGrape = (varietal = "") => {
  const f = fold(varietal);
  if (!f) return "";
  return GRAPE_ALIASES.get(f) || String(varietal).trim();
};

/** El color que implica una uva, o "" si no lo sabemos o es un corte. */
const grapeColor = (varietal = "") => GRAPE_COLOR[fold(varietal)] || "";

module.exports = {
  ABBREVIATIONS,
  BLEND_STYLES,
  BLEND_SYNONYMS,
  GRAPE_ALIASES,
  GRAPE_COLOR,
  canonicalGrape,
  expandAbbreviation,
  grapeColor,
};
