// Búsqueda de vinos por texto usando Gemini.
//
// Es el segundo escalón del buscador: el catálogo curado cubre lo más conocido,
// y cuando no alcanza le preguntamos al modelo. Reusa la misma técnica que
// vision.service.js (responseSchema + temperature 0) para que devuelva JSON
// estructurado en vez de prosa.
//
// Importante: el modelo puede alucinar. Marcamos estos resultados con
// source "gemini" para poder distinguirlos del catálogo verificado.

const { generateJson, isGeminiConfigured } = require("./gemini.service");

const TIMEOUT_MS = 9000;
const MAX_ITEMS = 8;

const isAiSearchConfigured = isGeminiConfigured;

const buildPrompt = (query) => `Sos un sommelier experto en vinos argentinos.

El usuario busca: "${query}"

Devolvé hasta ${MAX_ITEMS} vinos REALES que existan comercialmente y coincidan con la búsqueda.

Reglas:
- Priorizá vinos ARGENTINOS. Sólo incluí extranjeros si la búsqueda claramente pide otro origen.
- Sólo vinos que existan de verdad. Si no estás seguro de que un vino exista, no lo incluyas.
- Es mejor devolver 2 vinos correctos que 8 inventados. Si no conocés ninguno, devolvé una lista vacía.
- No inventes añadas: dejá "vintage" vacío salvo que el vino sea de una cosecha específica famosa.
- "name" es la línea del vino sin la bodega (ej: bodega "Catena Zapata", name "Catena Alta Malbec").
- "region" con formato "Subregión, Provincia" cuando lo sepas (ej: "Valle de Uco, Mendoza").`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    wines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          winery: { type: "string" },
          region: { type: "string" },
          varietal: { type: "string" },
          vintage: { type: "string" },
          type: {
            type: "string",
            enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
          },
        },
        required: ["name", "winery"],
      },
    },
  },
  required: ["wines"],
};

const slug = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Busca vinos por texto con Gemini. Devuelve [] si no está configurado.
 * Lanza si la API falla, para que el llamador decida el fallback.
 */
const searchWinesWithAi = async (query) => {
  if (!isGeminiConfigured()) return [];

  const parsed = await generateJson({
    parts: [{ text: buildPrompt(query) }],
    schema: RESPONSE_SCHEMA,
    timeoutMs: TIMEOUT_MS,
  });

  const wines = Array.isArray(parsed?.wines) ? parsed.wines : [];

  return wines
    .map((w) => {
      const name = String(w.name || "").trim();
      const winery = String(w.winery || "").trim();
      if (!name || !winery) return null;
      return {
        id: `ai-${slug(`${winery}-${name}`)}`,
        name,
        winery,
        region: String(w.region || "").trim(),
        varietal: String(w.varietal || "").trim(),
        vintage: String(w.vintage || "").trim(),
        type: String(w.type || "unknown").trim() || "unknown",
        image: "",
        rating: 0,
        barcode: "",
        source: "gemini",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
};

module.exports = { isAiSearchConfigured, searchWinesWithAi };
