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
const { FIELD_CONVENTION, composeDisplayName } = require("../data/wineIdentity");

const TIMEOUT_MS = 9000;
const BUDGET_MS = 14000;
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
- "region" con formato "Subregión, Provincia" cuando lo sepas (ej: "Valle de Uco, Mendoza").

${FIELD_CONVENTION}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    wines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          winery: { type: "string" },
          line: { type: "string" },
          name: { type: "string" },
          region: { type: "string" },
          varietal: { type: "string" },
          vintage: { type: "string" },
          type: {
            type: "string",
            enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
          },
        },
        required: ["winery", "line", "name", "varietal"],
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
    budgetMs: BUDGET_MS,
  });

  const wines = Array.isArray(parsed?.wines) ? parsed.wines : [];

  return wines
    .map((w) => {
      const winery = String(w.winery || "").trim();
      const line = String(w.line || "").trim();
      const properName = String(w.name || "").trim();
      const varietal = String(w.varietal || "").trim();
      // El nombre visible se compone igual que en el catálogo curado, así los
      // resultados de las dos fuentes se pueden deduplicar entre sí.
      const name = composeDisplayName({ name: properName, line, varietal, winery });
      if (!name || !winery) return null;
      return {
        id: `ai-${slug(`${winery}-${line || properName}-${varietal}`)}`,
        name,
        line,
        properName,
        winery,
        region: String(w.region || "").trim(),
        varietal,
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

// --- Descripción de un vino (ficha estilo Vivino) ---

const DESCRIBE_SCHEMA = {
  type: "object",
  properties: {
    // Reseña corta en prosa, 2-3 oraciones.
    summary: { type: "string" },
    // Perfil de boca (cuerpo, taninos, acidez) en una frase.
    body: { type: "string" },
    // Etiquetas cortas de perfil, estilo Vivino (ej: "Cuerpo medio", "Seco").
    profile: { type: "array", items: { type: "string" } },
    // Estructura en números 1-5. Convertir conocimiento de vino en valores
    // comparables es justo lo que un modelo puede hacer y la app no: permite
    // mostrar barras y comparar botellas entre sí.
    structure: {
      type: "object",
      properties: {
        body: { type: "integer" },
        acidity: { type: "integer" },
        tannin: { type: "integer" },
        sweetness: { type: "integer" },
      },
      required: ["body", "acidity", "tannin", "sweetness"],
    },
    // "Si te gustó X, probablemente…": requiere saber qué vinos se parecen,
    // que es conocimiento que la app no tiene de ninguna otra forma.
    similarTo: { type: "array", items: { type: "string" } },
    aromas: { type: "array", items: { type: "string" } },
    foodPairing: { type: "array", items: { type: "string" } },
    // Graduación típica del estilo. 0 si no se sabe.
    alcohol: { type: "number" },
    // Sugerencia de temperatura de servicio, ej "16-18 °C".
    serve: { type: "string" },
    // Confianza de que el vino es real y conocido: true/false.
    known: { type: "boolean" },
  },
  required: ["summary", "known"],
};

const buildDescribePrompt = (wine) => {
  const parts = [
    wine.name && `Nombre: ${wine.name}`,
    wine.winery && `Bodega: ${wine.winery}`,
    wine.varietal && `Varietal: ${wine.varietal}`,
    wine.region && `Región: ${wine.region}`,
    wine.type && wine.type !== "unknown" && `Tipo: ${wine.type}`,
    wine.vintage && `Añada: ${wine.vintage}`,
  ].filter(Boolean).join("\n");

  return `Sos un sommelier argentino. Describí este vino para una app de bodega personal:

${parts}

Devolvé:
- summary: 2-3 oraciones, tono cercano y claro (no marketinero), sobre el estilo y a qué apunta.
- body: una frase sobre cuerpo, taninos y acidez.
- profile: 3 a 5 etiquetas MUY cortas de perfil, estilo ficha (ej: "Cuerpo medio", "Taninos suaves", "Seco", "Acidez media", "Frutado"). Solo el atributo, sin explicación.
- structure: la estructura en números del 1 al 5, para poder compararla con otros vinos:
  body 1=muy liviano 5=muy corpulento · acidity 1=baja 5=muy fresca ·
  tannin 1=casi sin taninos 5=muy tánico (en blancos y espumantes va 1) ·
  sweetness 1=seco 5=dulce (la mayoría de los tintos argentinos son 1).
- similarTo: 1 a 3 vinos REALES parecidos en estilo, por los que alguien a quien le
  guste este podría empezar. Formato "Bodega Línea" (ej: "Catena Alta Malbec").
  Si no se te ocurre ninguno del que estés seguro, devolvé lista vacía.
- aromas: 3 a 6 aromas/sabores típicos (ej: "cereza", "vainilla", "pimienta").
- foodPairing: 3 a 5 comidas que maridan bien.
- alcohol: graduación típica del estilo (número, ej 14). 0 si no sabés.
- serve: temperatura de servicio sugerida (ej "16-18 °C").
- known: true sólo si conocés este vino o su estilo con razonable certeza; false si estarías adivinando.

Reglas: no inventes datos específicos que no puedas saber (premios, puntajes, precios).
Si no conocés el vino puntual, describí de forma general según su varietal y región, y poné known:false.`;
};

/**
 * Genera una descripción estructurada de un vino. Devuelve null si no está
 * configurado Gemini o si falla (el llamador decide el fallback).
 */
// La estructura sólo sirve si es comparable: acotamos a 1-5 y descartamos el
// objeto entero si el modelo no devolvió nada usable.
const clampStructure = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let ok = false;
  for (const k of ["body", "acidity", "tannin", "sweetness"]) {
    const n = Math.round(Number(raw[k]));
    if (Number.isFinite(n) && n >= 1 && n <= 5) {
      out[k] = n;
      ok = true;
    } else {
      out[k] = null;
    }
  }
  return ok ? out : null;
};

const describeWine = async (wine) => {
  if (!isGeminiConfigured()) return null;
  if (!wine?.name) return null;

  const parsed = await generateJson({
    parts: [{ text: buildDescribePrompt(wine) }],
    schema: DESCRIBE_SCHEMA,
    timeoutMs: 12000,
  });

  const clean = (s) => String(s || "").trim();
  const list = (arr, max) =>
    Array.isArray(arr)
      ? arr.map((x) => clean(x)).filter(Boolean).slice(0, max)
      : [];

  const alcohol = Number(parsed?.alcohol);

  return {
    summary: clean(parsed?.summary),
    body: clean(parsed?.body),
    profile: list(parsed?.profile, 5),
    structure: clampStructure(parsed?.structure),
    similarTo: list(parsed?.similarTo, 3),
    aromas: list(parsed?.aromas, 6),
    foodPairing: list(parsed?.foodPairing, 5),
    alcohol: Number.isFinite(alcohol) && alcohol > 0 && alcohol < 25 ? alcohol : null,
    serve: clean(parsed?.serve),
    known: parsed?.known !== false,
  };
};

module.exports = { isAiSearchConfigured, searchWinesWithAi, describeWine };
