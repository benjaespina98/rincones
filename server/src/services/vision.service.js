// Reconocimiento de etiquetas de vino con Gemini (visión multimodal).
// Devuelve datos estructurados a partir de la foto de la etiqueta.
// Si no hay GEMINI_API_KEY, no está configurado y el controlador cae al OCR.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 15000;

const isVisionConfigured = () => Boolean(String(process.env.GEMINI_API_KEY || "").trim());

const PROMPT = `Sos un sommelier experto en reconocer vinos por su etiqueta.
Analizá esta foto de la etiqueta de una botella de vino y extraé SOLO lo que puedas leer con seguridad.

Campos:
- name: nombre del vino tal como aparece (la línea principal/marca del vino), sin incluir la bodega si se puede separar.
- winery: bodega o productor.
- vintage: año de cosecha (4 dígitos) si aparece; si no, vacío.
- varietal: cepa o varietal (ej: Malbec, Cabernet Sauvignon, Chardonnay) si aparece.
- region: región o país de origen si aparece.
- type: tipo de vino que veas (red, white, rosé, sparkling, fortified) o "unknown".
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
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurada");
  }
  const model = String(process.env.GEMINI_MODEL || "").trim() || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType || "image/jpeg", data: buffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status} ${detail.slice(0, 180)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini devolvió una respuesta vacía");
    }

    const parsed = JSON.parse(text);
    return {
      name: String(parsed.name || "").trim(),
      winery: String(parsed.winery || "").trim(),
      vintage: String(parsed.vintage || "").trim(),
      varietal: String(parsed.varietal || "").trim(),
      region: String(parsed.region || "").trim(),
      type: String(parsed.type || "unknown").trim() || "unknown",
      isWineLabel: parsed.isWineLabel !== false,
    };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { isVisionConfigured, analyzeWineLabel };
