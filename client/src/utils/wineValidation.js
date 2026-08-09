// Espejo cliente de server/src/data/wineValidation.js.
//
// Se duplica por el mismo motivo que wineIdentity.js: la pantalla de revisión
// tiene que saber si una lectura es dudosa ANTES de guardar, y preguntárselo al
// servidor sería un viaje de red en el medio del camino crítico del escaneo,
// justo cuando la persona tiene el teléfono en una mano y la botella en la otra.
//
// ── LA ASIMETRÍA ES A PROPÓSITO ─────────────────────────────────────────────
// El vocabulario de uvas de acá es más corto que el del servidor: el del
// servidor se construye sumando todos los varietales del catálogo curado (544
// líneas que no tiene sentido mandar al navegador). O sea que el cliente puede
// marcar como "no reconocida" una uva que el servidor sí conoce.
//
// Esa asimetría es segura y no es casual: el error del cliente es de más, y de
// más significa "le preguntamos a la persona algo que quizá no hacía falta". El
// error caro es el otro —dejar pasar algo mal a la base compartida— y de eso
// decide el servidor, que tiene el vocabulario completo. Quien publica es el que
// más sabe; quien pregunta es el que está más cerca.

import { VARIETALS } from "../data/wineReference";
import { composeDisplayName } from "./wineIdentity";

export const CONFIDENCE = { TRUSTED: 80, REVIEW: 50 };

const fold = (s = "") =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const GRAPE_COLOR = {
  malbec: "red", "cabernet sauvignon": "red", "cabernet franc": "red", merlot: "red",
  syrah: "red", "pinot noir": "red", bonarda: "red", tempranillo: "red",
  "petit verdot": "red", tannat: "red", sangiovese: "red",
  chardonnay: "white", "sauvignon blanc": "white", torrontes: "white", semillon: "white",
  viognier: "white", "chenin blanc": "white", gewurztraminer: "white",
  "pinot grigio": "white", riesling: "white",
};

const BLEND_TERMS = [
  "blend", "corte", "gran corte", "blend blanco", "white blend",
  "gran blend", "barrel blend", "blend de blancs",
];

const VOCABULARY = new Set([
  ...VARIETALS.map(fold),
  ...Object.keys(GRAPE_COLOR),
  ...BLEND_TERMS,
]);

export const isKnownVarietal = (varietal = "") => {
  const v = fold(varietal);
  if (!v) return true;
  return VOCABULARY.has(v);
};

export const grapeColor = (varietal = "") => GRAPE_COLOR[fold(varietal)] || "";

export const BLOCKING_ISSUES = new Set(["sin-nombre", "nombre-es-bodega"]);

/**
 * Qué está mal en la lectura que se está revisando.
 *
 * Toma la forma de ScanReview (`properName` + `line`), no la del vino guardado.
 */
export const checkCoherence = (values = {}) => {
  const issues = [];

  const nombre = composeDisplayName({ name: values.properName, line: values.line });
  const bodega = String(values.winery || "").trim();
  const varietal = String(values.varietal || "").trim();

  if (!nombre) issues.push("sin-nombre");
  // `sameNameConfirmed` es la respuesta de la persona a este mismo aviso. Hay
  // muchos vinos que se llaman como su bodega —Norton, El Enemigo, Durigutti— y
  // sin una salida el aviso era un callejón: ningún dato que escribiera podía
  // hacerlo desaparecer. Acá el cliente no consulta el catálogo curado (el
  // servidor sí lo hace, y esa asimetría es la de siempre: preguntar de más es
  // barato).
  else if (bodega && fold(nombre) === fold(bodega) && !values.sameNameConfirmed) {
    issues.push("nombre-es-bodega");
  }

  if (varietal && !isKnownVarietal(varietal)) issues.push("varietal-desconocido");

  const color = grapeColor(varietal);
  const tipo = String(values.type || "unknown").trim();
  if (color === "red" && tipo === "white") issues.push("tipo-incoherente");
  if (color === "white" && tipo === "red") issues.push("tipo-incoherente");

  const bruto = values.vintage;
  if (bruto !== "" && bruto !== undefined && bruto !== null) {
    const year = Number.parseInt(bruto, 10);
    const max = new Date().getFullYear() + 1;
    if (!Number.isFinite(year) || year < 1900 || year > max) issues.push("cosecha-implausible");
  }

  return issues;
};

/** Ver el comentario largo en el archivo del servidor: la regla es la misma. */
export const identificationVerdict = ({
  values = {},
  confidence = {},
  editedFields = [],
  source = "",
  issues = null,
} = {}) => {
  const problemas = issues || checkCoherence(values);
  const editados = new Set(editedFields || []);
  const esManual = source === "manual";

  const confDe = (campo) => {
    if (editados.has(campo)) return 100;
    if (esManual) return String(values[campo] || "").trim() ? 100 : 0;
    const n = Number(confidence[campo]);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  };

  // El nombre propio viaja como `properName` en la revisión y su confianza como
  // `name`: es el mismo campo con dos nombres, y acá se cruzan.
  const confNombre = Math.max(
    editados.has("properName") ? 100 : confDe("name"),
    confDe("line")
  );
  const confBodega = confDe("winery");

  const bloqueante = problemas.some((i) => BLOCKING_ISSUES.has(i));
  if (bloqueante || confNombre < CONFIDENCE.REVIEW) return "doubtful";

  if (problemas.length === 0 && confNombre >= CONFIDENCE.TRUSTED && confBodega >= CONFIDENCE.TRUSTED) {
    return "trusted";
  }

  return "unverified";
};

/** Qué campos hay que abrir para poder arreglar cada problema. */
export const FIELDS_FOR_ISSUE = {
  "sin-nombre": ["line", "properName"],
  "nombre-es-bodega": ["line", "properName", "winery"],
  "varietal-desconocido": ["varietal"],
  "tipo-incoherente": ["varietal"],
  "cosecha-implausible": ["vintage"],
};

/**
 * Cómo se le cuenta cada problema a la persona.
 *
 * Dicho como una observación, no como un reproche: el que se equivocó fue el
 * lector de etiquetas, no ella. Y siempre nombrando el dato concreto que hay que
 * mirar, porque el mensaje aparece justo al lado del campo que lo arregla.
 */
export const ISSUE_COPY = {
  "sin-nombre": "No pudimos leer cómo se llama este vino. Escribí la línea o el nombre.",
  "nombre-es-bodega":
    "El nombre y la bodega nos quedaron iguales. Fijate cuál es cuál en la etiqueta, o confirmá que se llaman igual.",
  "varietal-desconocido": "Esa uva no nos suena. Revisá cómo está escrita.",
  "tipo-incoherente": "La uva y el tipo no coinciden. Revisá cuál de los dos leímos mal.",
  "cosecha-implausible": "Ese año no puede ser. Revisá la cosecha.",
};
