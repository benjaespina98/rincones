// Reconocimiento de etiquetas de vino con Gemini (visión multimodal).
// Devuelve datos estructurados a partir de la foto de la etiqueta.
// Si no hay GEMINI_API_KEY, no está configurado y el controlador cae al OCR.

const { generateJson, isGeminiConfigured } = require("./gemini.service");

const TIMEOUT_MS = 15000;

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
Analizá esta foto de la etiqueta de una botella de vino y extraé SOLO lo que puedas leer con seguridad.

Campos:
- name: nombre del vino tal como aparece (la línea principal/marca del vino), sin incluir la bodega si se puede separar.
- winery: bodega o productor.
- vintage: año de cosecha (4 dígitos, ej: 2019). Buscá el año en cualquier parte de la etiqueta (frente, cuello, contraetiqueta). NO confundas con graduación alcohólica, volumen (750 ml) ni códigos. Si no ves ningún año, vacío.
- varietal: cepa/uva (ej: Malbec, Cabernet Sauvignon, Cabernet Franc, Chardonnay, Sauvignon Blanc, Torrontés, Bonarda, Syrah, Merlot, Pinot Noir, Tempranillo, Tannat). Si es un corte/blend de varias, poné "Blend". Usá el nombre completo y bien escrito de la uva aunque en la etiqueta esté abreviado (ej: "Cab. Sauv." -> "Cabernet Sauvignon").
- region: región o país de origen si aparece (ej: Luján de Cuyo, Mendoza; Valle de Uco).
- type: tipo de vino que veas (red, white, rosé, sparkling, fortified) o "unknown". Inferí por la uva si no lo dice: Malbec/Cabernet/Syrah/Bonarda/Merlot = red; Chardonnay/Sauvignon Blanc/Torrontés = white.
- isWineLabel: true si la imagen realmente es la etiqueta de un vino; false si no lo es.

Reglas: si un dato no está visible o no estás seguro, devolvé string vacío. No inventes datos.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    winery: { type: "string" },
    vintage: { type: "string" },
    varietal: { type: "string" },
    region: { type: "string" },
    type: {
      type: "string",
      enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
    },
    isWineLabel: { type: "boolean" },
  },
  required: ["name", "isWineLabel"],
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
  });

  return {
    name: String(parsed.name || "").trim(),
    winery: String(parsed.winery || "").trim(),
    vintage: normalizeVintage(parsed.vintage),
    varietal: normalizeVarietal(parsed.varietal),
    region: String(parsed.region || "").trim(),
    type: String(parsed.type || "unknown").trim() || "unknown",
    isWineLabel: parsed.isWineLabel !== false,
  };
};

module.exports = { isVisionConfigured, analyzeWineLabel };
