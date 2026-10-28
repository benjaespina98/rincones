// Reconocimiento de etiquetas de vino con Gemini (visión multimodal).
// Devuelve datos estructurados a partir de la foto de la etiqueta.
// Si no hay GEMINI_API_KEY, no está configurado y el controlador cae al OCR.

// Namespace y no destructuring: así el test puede reemplazar
// `geminiService.generateJson` sin tocar Gemini de verdad — desestructurado,
// este módulo se queda con su propia copia de la referencia y el mock de
// afuera no le llega nunca (mismo motivo por el que wines.service.js importa
// wineImages/winePrices/communityWines como objeto, no por partes).
const geminiService = require("./gemini.service");
const { FIELD_CONVENTION, composeDisplayName, canonicalGrape } = require("../data/wineIdentity");
const { canonicalVarietal, checkCoherence } = require("../data/wineValidation");
const { expandAbbreviation } = require("../data/grapes");
const { esGenerico } = require("../data/wineMatching");
const { fold } = require("../data/argentineWines");
const { limpiarDato } = require("../utils/promptSeguro");

const TIMEOUT_MS = 12000;
// Tope total de la llamada. El cliente aborta a los 30s: el server tiene que
// perder esa carrera siempre, para que el usuario vea un error real y no una
// petición colgada mientras seguimos quemando cuota.
const BUDGET_MS = 22000;

const isVisionConfigured = () => geminiService.isGeminiConfigured();

/**
 * La tabla de abreviaturas vivía acá y ahora está en data/grapes.js, con el
 * resto del vocabulario de uvas.
 *
 * Incluía además `corte: "Blend"` y `"gran corte": "Blend"`, que eran de otra
 * naturaleza: no expandían una abreviatura, TRADUCÍAN una palabra por otra. La
 * diferencia importa porque esto corre al LEER y lo que sale se guarda: una
 * etiqueta que dice "Corte" quedaba guardada como "Blend", y la ficha mostraba
 * una palabra que no está impresa en la botella. El catálogo curado tiene un
 * vino cuyo varietal ES "Corte" (Luigi Bosca De Sangre), así que ni siquiera era
 * una forma no canónica: era el dato correcto, reescrito.
 *
 * Unificar "Corte" con "Blend" sigue pasando, pero donde corresponde: en la
 * CLAVE, vía `canonicalGrape`. Ahí los dos se cruzan contra la misma fila sin
 * que nadie pierda lo que decía su etiqueta.
 */
// Deja sólo un año de cosecha plausible (1900..año actual+1) o vacío.
const normalizeVintage = (raw = "") => {
  const m = String(raw).match(/\b(19|20)\d{2}\b/);
  if (!m) return "";
  const year = Number(m[0]);
  const max = new Date().getFullYear() + 1;
  return year >= 1900 && year <= max ? String(year) : "";
};

const PROMPT = `Sos un sommelier experto en reconocer vinos por su etiqueta.
Analizá esta foto y extraé SOLO lo que puedas leer con seguridad.

${FIELD_CONVENTION}

Además:
- vintage: año de cosecha (4 dígitos, ej: 2019). Buscalo en cualquier parte de la etiqueta
  (frente, cuello, contraetiqueta). NO confundas con la graduación alcohólica, el volumen
  (750 ml) ni códigos de lote. Si no ves ningún año, vacío.
- region: región o país de origen si aparece (ej: "Luján de Cuyo, Mendoza", "Valle de Uco").
- type: red, white, rosé, sparkling, fortified o "unknown". Si no lo dice la etiqueta, inferilo
  por la uva: Malbec/Cabernet/Syrah/Bonarda/Merlot = red; Chardonnay/Sauvignon Blanc/Torrontés = white.
- isWineLabel: true si la imagen realmente es la etiqueta de un vino; false si no lo es.

CONFIANZA (objeto "confidence", un entero 0-100 por campo). Puntuá según lo que hiciste
para obtener el dato, no según tu impresión general:
- 95-100: el texto está nítido y el dato aparece LITERAL en la etiqueta.
- 70-94: lo leí, pero con alguna duda (letra tapada, brillo, cursiva difícil).
- 40-69: lo INFERÍ, no lo leí (deduje el tipo por la uva, la región por la bodega).
- 1-39: es una adivinanza.
- 0: el campo va vacío.

Reglas obligatorias de la confianza:
1. Todo campo que devuelvas vacío DEBE tener confianza 0.
2. Si dudás entre si un texto es "line" o "name", ambos van con 60 o menos.
3. Un "type" inferido desde la uva nunca supera 69.

Si un dato no está visible o no estás seguro, devolvé string vacío. No inventes datos.`;

// El objeto `confidence` va ÚLTIMO a propósito: Gemini emite en el orden del
// schema, así escribe primero el valor y después lo puntúa (si no, tiende a
// poner 95 en todo por reflejo).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    winery: { type: "string" },
    line: { type: "string" },
    name: { type: "string" },
    varietal: { type: "string" },
    vintage: { type: "string" },
    region: { type: "string" },
    type: {
      type: "string",
      enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
    },
    isWineLabel: { type: "boolean" },
    confidence: {
      type: "object",
      properties: {
        winery: { type: "integer" },
        line: { type: "integer" },
        name: { type: "integer" },
        varietal: { type: "integer" },
        vintage: { type: "integer" },
        region: { type: "integer" },
        type: { type: "integer" },
      },
      required: ["winery", "line", "name", "varietal", "vintage", "region", "type"],
    },
  },
  required: ["winery", "line", "name", "varietal", "isWineLabel", "confidence"],
};

const CONFIDENCE_FIELDS = ["winery", "line", "name", "varietal", "vintage", "region", "type"];

/**
 * Sanea la confianza que devolvió el modelo.
 *
 * La regla "campo vacío ⇒ confianza 0" es mecánicamente verificable, así que la
 * aplicamos acá en vez de confiar en que el modelo la respete. También acota a
 * 0-100 y trata un campo faltante como 0 (desconocido), nunca como alta certeza.
 */
const clampConfidence = (raw, values) => {
  const out = {};
  for (const field of CONFIDENCE_FIELDS) {
    const empty = !values[field] || (field === "type" && values[field] === "unknown");
    if (empty) {
      out[field] = 0;
      continue;
    }
    const n = Number(raw?.[field]);
    out[field] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  return out;
};

/**
 * ── "RESERVA" NO ES EL NOMBRE DE NINGÚN VINO ────────────────────────────────
 *
 * El prompt lo pide, pero es la instrucción que el modelo desobedece más seguido,
 * y por un motivo entendible: en la etiqueta "RESERVA" suele estar impreso más
 * grande que la línea. Cuando eso pasa, el nombre propio queda con una palabra
 * que comparten cientos de botellas de decenas de bodegas, y desde ahí se
 * propaga a todo: es el nombre visible del vino, es el "core" con el que se
 * busca en el catálogo, y es lo que termina guardado.
 *
 * Es verificable sin mirar la foto —la palabra o es una categoría o no lo es—
 * así que se arregla acá en vez de confiar en que el modelo se acuerde:
 *
 *   · una categoría ("Reserva", "Roble", "Cosecha Tardía") es la LÍNEA: se pasa
 *     ahí si la línea está vacía, y si ya hay línea se descarta —el modelo
 *     partió en dos lo que era un solo dato—;
 *   · la uva no es un nombre: "Malbec" como nombre propio se descarta;
 *   · un nombre propio idéntico a la línea es la misma palabra escrita dos veces.
 *
 * Lo que NO se toca es la línea: una etiqueta que sólo dice bodega y uva deja el
 * vino sin nombre, y ese caso ya tiene su aviso ("sin-nombre") en la revisión.
 */
const ubicarNombrePropio = (values) => {
  const propio = values.name;
  if (!propio) return values;

  const esLaUva = fold(canonicalGrape(propio)) === fold(canonicalGrape(values.varietal || ""));
  const esLaLinea = values.line && fold(propio) === fold(values.line);

  if (esGenerico(propio) && !esLaUva) {
    return { ...values, name: "", line: values.line || propio };
  }
  if (esLaUva || esLaLinea) return { ...values, name: "" };

  return values;
};

/**
 * ── UNA LETRA SUELTA NO ES UN NOMBRE: ES UNA LECTURA QUE SE CORTÓ ───────────
 *
 * Reportado en vivo: una etiqueta de "Tomero", en cursiva, se guardó con el
 * nombre "T" — el modelo entregó esa única letra como su mejor lectura del
 * nombre propio, y nada de lo que sigue (armar el nombre visible, guardar el
 * vino) desconfiaba de que "T" fuera un dato real. El código no puede hacer
 * que Gemini lea mejor una etiqueta cursiva, pero sí puede negarse a tratar
 * una letra sola como si fuera el nombre de una botella — mismo principio
 * que la uva no reconocida, dos funciones más abajo: la confianza que
 * DECLARA el modelo no alcanza sola cuando lo que devolvió no pasa ni una
 * verificación mínima de forma.
 *
 * Se VACÍA, no se degrada nomás la confianza: el problema acá no es "hay que
 * verificarlo con más cuidado" (eso ya lo cubre `clampConfidence` para todo
 * campo dudoso) — es que una sola letra no puede ser un nombre de vino bajo
 * ninguna lectura, así que mostrarla, aunque sea en un campo editable, es
 * mostrarle a la persona un dato que ya sabemos que está mal. Vacío cae en
 * el mismo camino ya resuelto que una etiqueta sin nombre legible: "sin
 * identificar", se completa a mano — nunca aparece la letra suelta en
 * ningún lado de la pantalla de revisión.
 *
 * Sólo UNA letra, no dos: "V8" o "DV" son nombres reales cortos que sí vale
 * la pena mostrar y dejar confirmar; una sola letra ("T", "M") no distingue
 * ninguna botella de otra y en la práctica es siempre un corte de lectura,
 * nunca la etiqueta real.
 */
const esLetraSuelta = (texto) => /^[a-zà-ÿ]$/i.test(String(texto || "").trim());

const descartarLetraSuelta = (values) => ({
  ...values,
  name: esLetraSuelta(values.name) ? "" : values.name,
  line: esLetraSuelta(values.line) ? "" : values.line,
  winery: esLetraSuelta(values.winery) ? "" : values.winery,
});

/**
 * Analiza el buffer de imagen con Gemini y devuelve los datos de la etiqueta.
 * Lanza si falla (el controlador lo captura y cae al OCR).
 */
// El esquema ya restringe `type` a un enum, pero el esquema es un pedido y no una garantía: lo que
// vuelve se normaliza igual (mayúsculas, "rose" sin tilde, "tinto") y lo desconocido queda "unknown".
const TIPOS_VALIDOS = new Set(["red", "white", "rosé", "sparkling", "fortified", "unknown"]);
const SINONIMOS_TIPO = {
  rose: "rosé",
  tinto: "red",
  blanco: "white",
  rosado: "rosé",
  espumante: "sparkling",
  espumoso: "sparkling",
  fortificado: "fortified",
};
const normalizarTipo = (valor) => {
  const t = String(valor ?? "").trim().toLowerCase();
  if (TIPOS_VALIDOS.has(t)) return t;
  return SINONIMOS_TIPO[t] || "unknown";
};

const analyzeWineLabel = async (buffer, mimeType = "image/jpeg") => {
  const parsed = await geminiService.generateJson({
    parts: [
      { text: PROMPT },
      {
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: buffer.toString("base64"),
        },
      },
    ],
    schema: RESPONSE_SCHEMA,
    timeoutMs: TIMEOUT_MS,
    budgetMs: BUDGET_MS,
    // Leer una etiqueta es lo más exigente que le pedimos al modelo y el error
    // más caro: acá manda la calidad, no la latencia. Ver gemini.service.js.
    task: "vision",
  });

  // La uva pasa por dos filtros: el de forma (sinónimos, capitalización) y el de
  // vocabulario, que es el que corrige "Blen" → "Blend". Ese caso llegó a
  // producción: una letra que se perdió entre el relieve de la etiqueta y el
  // modelo, guardada tal cual y mostrada en la ficha y en la búsqueda.
  const uva = canonicalVarietal(expandAbbreviation(parsed.varietal));

  const values = descartarLetraSuelta(
    ubicarNombrePropio({
      winery: limpiarDato(parsed.winery, 80),
      line: limpiarDato(parsed.line, 80),
      name: limpiarDato(parsed.name, 80),
      varietal: uva.value,
      vintage: normalizeVintage(parsed.vintage),
      region: limpiarDato(parsed.region, 80),
      type: normalizarTipo(parsed.type),
    })
  );

  const confidence = clampConfidence(parsed.confidence, values);

  // Una uva que no reconocimos no puede seguir declarándose leída con seguridad:
  // el modelo cree que la leyó bien, y el que sabe que no es este módulo. Bajarla
  // al tramo de "verificá" es lo que hace que la revisión la muestre editable en
  // vez de esconderla en un chip.
  if (!uva.known) confidence.varietal = Math.min(confidence.varietal, 45);

  const issues = checkCoherence(values);

  return {
    ...values,
    // Nombre visible, compuesto con la MISMA regla que el catálogo curado.
    displayName: composeDisplayName(values),
    isWineLabel: parsed.isWineLabel !== false,
    confidence,
    // Qué no cierra en esta lectura. Viaja al cliente para que la revisión sepa
    // qué campos abrir sin tener que recalcularlo con medio vocabulario.
    issues,
  };
};

module.exports = {
  isVisionConfigured,
  analyzeWineLabel,
  normalizarTipo,
  // `esLetraSuelta` también la usa labels.controller.js para el nombre que
  // saca el OCR local (Tesseract): es el mismo riesgo ("Tomero" → "T") por
  // el mismo motivo —una lectura de imagen que se corta—, así que necesita
  // la misma guarda, no una copia. Las otras dos quedan exportadas sólo para
  // el test: son la parte determinística de la lectura, la que no necesita
  // llamar a Gemini para verificarse.
  esLetraSuelta,
  descartarLetraSuelta,
  ubicarNombrePropio,
};
