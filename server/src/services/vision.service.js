// Reconocimiento de etiquetas de vino con Gemini (visión multimodal).
// Devuelve datos estructurados a partir de la foto de la etiqueta.
// Si no hay GEMINI_API_KEY, no está configurado y el controlador cae al OCR.

const { generateJson, isGeminiConfigured } = require("./gemini.service");
const { FIELD_CONVENTION, composeDisplayName } = require("../data/wineIdentity");
const { canonicalVarietal, checkCoherence } = require("../data/wineValidation");

const TIMEOUT_MS = 12000;
// Tope total de la llamada. El cliente aborta a los 30s: el server tiene que
// perder esa carrera siempre, para que el usuario vea un error real y no una
// petición colgada mientras seguimos quemando cuota.
const BUDGET_MS = 22000;

const isVisionConfigured = isGeminiConfigured;

// Sinónimos/abreviaturas comunes de uvas → nombre canónico bien escrito.
const VARIETAL_SYNONYMS = {
  "cab sauv": "Cabernet Sauvignon",
  "cab. sauv.": "Cabernet Sauvignon",
  "cabernet sauv": "Cabernet Sauvignon",
  "cab franc": "Cabernet Franc",
  "cab. franc": "Cabernet Franc",
  "sauv blanc": "Sauvignon Blanc",
  "sauv. blanc": "Sauvignon Blanc",
  cs: "Cabernet Sauvignon",
  pv: "Petit Verdot",
  corte: "Blend",
  "gran corte": "Blend",
};

// Normaliza el varietal leído: aplica sinónimos y capitaliza prolijo.
const normalizeVarietal = (raw = "") => {
  const v = String(raw).trim();
  if (!v) return "";
  const low = v.toLowerCase().replace(/\s+/g, " ");
  if (VARIETAL_SYNONYMS[low]) return VARIETAL_SYNONYMS[low];
  return v
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
};

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
 * Analiza el buffer de imagen con Gemini y devuelve los datos de la etiqueta.
 * Lanza si falla (el controlador lo captura y cae al OCR).
 */
const analyzeWineLabel = async (buffer, mimeType = "image/jpeg") => {
  const parsed = await generateJson({
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
  const uva = canonicalVarietal(normalizeVarietal(parsed.varietal));

  const values = {
    winery: String(parsed.winery || "").trim(),
    line: String(parsed.line || "").trim(),
    name: String(parsed.name || "").trim(),
    varietal: uva.value,
    vintage: normalizeVintage(parsed.vintage),
    region: String(parsed.region || "").trim(),
    type: String(parsed.type || "unknown").trim() || "unknown",
  };

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

module.exports = { isVisionConfigured, analyzeWineLabel };
