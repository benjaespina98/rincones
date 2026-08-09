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

// Latencia REAL, medida contra la API (3 corridas por modelo, julio 2026):
//
//   gemini-3.1-flash-lite       766 ms
//   gemini-3.6-flash          2.691 ms
//   gemini-3.5-flash-lite     3.515 ms
//   gemini-flash-lite-latest  4.023 ms
//   gemini-2.0-flash          429 — sin cuota
//
// gemini-2.0-flash queda ÚLTIMO en las dos cadenas: hoy devuelve 429 siempre,
// así que ponerlo antes es regalar un segundo para nada. Sigue en la lista
// porque la cuota se renueva cada día.
//
// ── POR QUÉ HAY DOS CADENAS Y NO UNA ────────────────────────────────────────
// Había una sola, ordenada por latencia, y la compartían la búsqueda por texto y
// la LECTURA DE ETIQUETAS. Para la búsqueda ese orden es el correcto: son datos
// que el modelo o sabe o no sabe, y el chico los sabe igual de bien que el
// grande, así que ganar dos segundos por consulta es ganancia limpia.
//
// Para la visión estaba exactamente al revés. Descifrar una etiqueta —cursiva
// dorada sobre fondo dorado, relieve, brillo del flash, la bodega en cuerpo 6
// abajo de todo— es la tarea más exigente de la app, y la estaba haciendo
// SIEMPRE el modelo más chico de la lista porque era el más rápido. Un espumante
// Salentein mal leído cuesta muchísimo más que los dos segundos que ahorramos:
// el dato malo entra a la bodega de una persona y desde ahí puede llegar al
// catálogo público.
//
// Regla: donde el error es caro y recuperable sólo por una persona mirando,
// manda la calidad. Donde el error es barato, manda la latencia.
const SEARCH_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
];

// Visión: el flash entero primero y los lite después, de más nuevo a más viejo.
// Los lite siguen estando porque un escaneo que responde peor es mejor que un
// escaneo que no responde — pero son el plan B, no el primero que se prueba.
const VISION_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
];

// Compat: el nombre viejo, que era la cadena única. Sigue exportado y apunta a
// la de búsqueda, que es la que tenía ese orden.
const FALLBACK_MODELS = SEARCH_MODELS;

const isGeminiConfigured = () => Boolean(String(process.env.GEMINI_API_KEY || "").trim());

/**
 * La cadena a recorrer, con el override de entorno que corresponda.
 *
 * `GEMINI_VISION_MODEL` permite forzar el modelo de etiquetas sin tocar el de
 * búsqueda, que es justo lo que hace falta para probar si un modelo nuevo lee
 * mejor las etiquetas sin arriesgar el resto de la app. `GEMINI_MODEL` sigue
 * valiendo para las dos, como hasta ahora.
 */
const getModelChain = (task = "search") => {
  const base = task === "vision" ? VISION_MODELS : SEARCH_MODELS;
  const preferred =
    (task === "vision" ? String(process.env.GEMINI_VISION_MODEL || "").trim() : "") ||
    String(process.env.GEMINI_MODEL || "").trim();
  if (!preferred) return base;
  return [preferred, ...base.filter((m) => m !== preferred)];
};

// 429 = sin cuota, 404 = modelo no disponible acá. En ambos casos el próximo
// modelo puede funcionar. Un 400 (request mal armado) no se reintenta.
const shouldTryNextModel = (status) => status === 429 || status === 404 || status >= 500;

/**
 * Llama a Gemini con contenido estructurado, recorriendo la cadena de modelos.
 * Devuelve el JSON parseado de la respuesta.
 * Lanza sólo si fallaron todos los modelos.
 */
// Algunos modelos devuelven el JSON envuelto en un bloque ```json … ```.
const parseJsonLoose = (text) => {
  const clean = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(clean);
};

/**
 * @param {number} timeoutMs  Tope por modelo.
 * @param {number} budgetMs   Tope TOTAL de la llamada. Sin esto el timeout se
 *   aplicaba por modelo y, con 5 modelos en cadena, una visión de 15s podía
 *   bloquear 75s — mucho más que los 30s que espera el cliente, así que el
 *   usuario ya había visto el error mientras el server seguía gastando cuota.
 * @param {"search"|"vision"} task  Qué cadena de modelos usar. Ver arriba.
 */
const generateJson = async ({ parts, schema, timeoutMs = 10000, budgetMs, task = "search" }) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const deadline = Date.now() + (budgetMs ?? timeoutMs * 2);

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  let lastError = null;

  for (const model of getModelChain(task)) {
    const remaining = deadline - Date.now();
    // Sin margen para una llamada útil: cortamos en vez de encadenar timeouts.
    if (remaining < 500) {
      lastError = lastError || new Error("Gemini agotó el presupuesto de tiempo");
      break;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
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
      const candidate = data?.candidates?.[0];
      // Una respuesta truncada produce JSON inválido: la tratamos como fallo.
      if (candidate?.finishReason === "MAX_TOKENS") {
        lastError = new Error(`Gemini ${model} cortó la respuesta (MAX_TOKENS)`);
        continue;
      }

      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = new Error(`Gemini ${model} devolvió una respuesta vacía`);
        continue;
      }

      // JSON.parse sin proteger mataba toda la cadena por un solo modelo que
      // devolviera basura, aunque el siguiente hubiera respondido bien.
      try {
        return parseJsonLoose(text);
      } catch {
        lastError = new Error(`Gemini ${model} devolvió JSON inválido`);
        continue;
      }
    } catch (error) {
      // Timeout o red: probamos el siguiente modelo.
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Gemini no devolvió resultados");
};

module.exports = {
  generateJson,
  isGeminiConfigured,
  FALLBACK_MODELS,
  SEARCH_MODELS,
  VISION_MODELS,
  getModelChain,
};
