// Cliente compartido de Gemini.
//
// Existe por un problema concreto del tier gratuito: la cuota es POR MODELO
// (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier). Cuando un modelo
// agota su cupo diario devuelve 429 y la función que lo use queda muerta hasta
// medianoche, aunque el resto de los modelos tengan cuota intacta.
//
// Solución: probamos una cadena de modelos en orden. Si uno devuelve 429 (sin
// cuota) o 404 (no servido en esta versión de la API), seguimos con el próximo.
// Así el escaneo de etiquetas y el buscador siguen andando sin intervención.
//
// Centralizarlo además evita duplicar el armado del request entre
// vision.service.js (etiquetas) y wineAi.service.js (búsqueda).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Ordenados por latencia medida: los lite responden ~1s, los flash grandes ~7s.
// GEMINI_MODEL en .env, si está, se prueba primero.
const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-3.6-flash",
];

const isGeminiConfigured = () => Boolean(String(process.env.GEMINI_API_KEY || "").trim());

const getModelChain = () => {
  const preferred = String(process.env.GEMINI_MODEL || "").trim();
  if (!preferred) return FALLBACK_MODELS;
  return [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
};

// 429 = sin cuota, 404 = modelo no disponible acá. En ambos casos el próximo
// modelo puede funcionar. Un 400 (request mal armado) no se reintenta.
const shouldTryNextModel = (status) => status === 429 || status === 404 || status >= 500;

/**
 * Llama a Gemini con contenido estructurado, recorriendo la cadena de modelos.
 * Devuelve el JSON parseado de la respuesta.
 * Lanza sólo si fallaron todos los modelos.
 */
const generateJson = async ({ parts, schema, timeoutMs = 10000 }) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  let lastError = null;

  for (const model of getModelChain()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastError = new Error(`Gemini ${model} HTTP ${res.status} ${detail.slice(0, 140)}`);
        if (shouldTryNextModel(res.status)) continue;
        throw lastError;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = new Error(`Gemini ${model} devolvió una respuesta vacía`);
        continue;
      }

      return JSON.parse(text);
    } catch (error) {
      // Timeout o red: probamos el siguiente modelo.
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Gemini no devolvió resultados");
};

module.exports = { generateJson, isGeminiConfigured, FALLBACK_MODELS };
