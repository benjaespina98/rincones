const { discoverPlaces } = require("./geocoding.service");

const AI_RERANK_BASE_URL = String(process.env.AI_RERANK_BASE_URL || "https://openrouter.ai/api/v1").trim();
const AI_CHAT_MODEL = String(process.env.AI_CHAT_MODEL || process.env.AI_RERANK_MODEL || "openai/gpt-4o-mini").trim();
const AI_CHAT_TIMEOUT_MS = Number(process.env.AI_CHAT_TIMEOUT_MS || 9000);

const CATEGORY_ALIASES = {
  all: "all",
  vinoteca: "vinoteca",
  vinotecas: "vinoteca",
  winebar: "winebar",
  "wine-bar": "winebar",
  "bar de vinos": "winebar",
  degustacion: "degustacion",
  degustaciones: "degustacion",
  cata: "degustacion",
  tasting: "degustacion",
  bodega: "bodega",
  bodegas: "bodega",
  vinedo: "bodega",
  "viñedo": "bodega",
  feria_vino: "feria_vino",
  feria: "feria_vino",
  cafe: "cafeteria",
  cafeterias: "cafeteria",
  cafeteria: "cafeteria",
  restaurant: "restaurante",
  restaurants: "restaurante",
  restaurante: "restaurante",
  bares: "bar",
  bar: "bar",
  pub: "bar",
  pubs: "bar",
  mirador: "mirador",
  miradores: "mirador",
  turistico: "turistico",
  turismo: "turistico",
  rio: "rio",
  rios: "rio",
  river: "rio",
  montana: "montana",
  mountain: "montana",
};

const INTENT_KEYWORDS = {
  vinoteca: ["vinoteca", "vinos", "cava", "botella", "sommelier", "wine shop"],
  winebar: ["wine bar", "bar de vinos", "vino por copa", "copas", "after office"],
  degustacion: ["degustacion", "degustación", "cata", "tasting", "maridaje", "flight"],
  bodega: ["bodega", "vinedo", "viñedo", "enoturismo", "tour del vino"],
  feria_vino: ["feria de vino", "festival del vino", "expo vino", "evento de vino"],
  bar: ["bar", "birra", "cerveza", "vermu", "vermuth", "trago", "cocktail", "pub"],
  cafeteria: ["cafe", "café", "cafeteria", "cafetería", "merienda", "brunch"],
  restaurante: ["restaurante", "comida", "cena", "almuerzo", "pizza", "hamburguesa", "parrilla", "sushi"],
  rio: ["rio", "río", "costanera", "laguna", "balneario", "arroyo", "cascada"],
  montana: ["montana", "montaña", "cerro", "trekking", "sendero"],
  mirador: ["mirador", "vista", "panoramica", "panorámica"],
  turistico: ["museo", "monumento", "historia", "paseo", "turistico", "turístico"],
};

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const cleanSentence = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();

const normalizeCategory = (value = "") => {
  const normalized = normalizeText(value);
  return CATEGORY_ALIASES[normalized] || normalized || "all";
};

const inferIntentCategories = ({ message, categoria }) => {
  const normalizedCategoria = normalizeCategory(categoria);
  if (normalizedCategoria && normalizedCategoria !== "all") {
    return new Set([normalizedCategoria]);
  }

  const text = normalizeText(message);
  const detected = new Set();
  Object.entries(INTENT_KEYWORDS).forEach(([category, keywords]) => {
    if (keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      detected.add(category);
    }
  });

  return detected;
};

const getIntentAlignedResults = ({ results, intentCategories }) => {
  const safeResults = Array.isArray(results) ? results : [];
  if (!intentCategories?.size) {
    return safeResults;
  }

  const aligned = safeResults.filter((item) => intentCategories.has(normalizeCategory(item?.categoria)));
  if (aligned.length >= Math.min(2, safeResults.length)) {
    return aligned;
  }

  return aligned.length ? [...aligned, ...safeResults.filter((item) => !aligned.includes(item))] : safeResults;
};

const sanitizeTips = (tips = []) =>
  (Array.isArray(tips) ? tips : [])
    .map((tip) => cleanSentence(tip))
    .filter((tip) => tip.length >= 14 && tip.length <= 180)
    .slice(0, 4);

const toPickPayload = (item) => ({
  id: item.id,
  nombre: item.nombre,
  categoria: item.categoria,
  distanciaKm: item.distanciaKm,
  fuente: item.fuente,
  direccion: item.direccion,
  ratingAproximado: item.ratingAproximado,
  osmUrl: item.osmUrl,
  foto: item.foto || "",
});

const scoreForAssistantPick = (item = {}) => {
  let score = 0;
  if (item.foto) score += 8;
  if (item.contacto?.instagramUrl) score += 2;
  if (item.contacto?.sitioWeb) score += 1;
  if (Number.isFinite(Number(item.ratingAproximado))) score += Number(item.ratingAproximado);
  if (Number.isFinite(Number(item.relevancia))) score += Number(item.relevancia) / 10;
  if (Number.isFinite(Number(item.distanciaKm))) {
    const distance = Number(item.distanciaKm);
    if (distance <= 2) score += 4;
    else if (distance <= 5) score += 2;
    else if (distance >= 20) score -= 2;
  }
  return score;
};

const buildHeuristicSummary = ({ message, picks }) => {
  if (!picks.length) {
    return "No encontré recomendaciones sólidas todavía. Probá afinar zona, momento del día o tipo de plan para darte opciones más precisas.";
  }

  const first = picks[0]?.nombre || "una opción";
  const second = picks[1]?.nombre;
  const third = picks[2]?.nombre;
  const tail = [second, third].filter(Boolean).join(" y ");
  return tail
    ? `Para "${message}", arrancaría por ${first}. También tenés ${tail} como alternativas consistentes.`
    : `Para "${message}", la mejor opción inicial es ${first}.`;
};

const defaultPicksFromResults = (results = [], max = 3) =>
  (Array.isArray(results) ? results : [])
    .slice()
    .sort((a, b) => scoreForAssistantPick(b) - scoreForAssistantPick(a))
    .slice(0, Math.max(1, max))
    .map(toPickPayload);

const parseJsonObjectFromText = (text = "") => {
  const content = String(text || "").trim();
  if (!content) {
    return null;
  }

  const normalized = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonText = normalized.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

const heuristicAssistantAnswer = ({ message, results, context = {} }) => {
  const top = defaultPicksFromResults(results, 3);
  const recentQueries = Array.isArray(context.recentQueries) ? context.recentQueries : [];
  const prevQuery = String(recentQueries[recentQueries.length - 2] || "").trim();

  if (!top.length) {
    return {
      summary: "No encontré recomendaciones de vino sólidas todavía. Probá ajustar zona, estilo de vino o presupuesto para afinar el maridaje.",
      tips: [
        "Usá una consulta más específica (ej: wine bar para after office, vinoteca con malbec premium).",
        "Activá ubicación actual para mejorar relevancia geográfica.",
      ],
      picks: [],
      provider: "heuristic",
      aiEnabled: false,
    };
  }

  const summary = buildHeuristicSummary({ message, picks: top });
  const transitionHint = prevQuery
    ? `Tomé en cuenta que antes habías consultado "${prevQuery}" para ajustar mejor el plan de ahora.`
    : "";

  return {
    summary: [summary, transitionHint].filter(Boolean).join(" "),
    tips: [
      "Priorizá lugares con mejor score y menor distancia.",
      "Abrí en Maps y validá reseñas/horarios antes de ir.",
    ],
    picks: top,
    provider: "heuristic",
    aiEnabled: false,
  };
};

const askAssistantWithAI = async ({ message, zona, categoria, results, context = {} }) => {
  const apiKey = String(process.env.AI_RERANK_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const candidates = results.slice(0, 12).map((item) => ({
    id: item.id,
    nombre: item.nombre,
    categoria: item.categoria,
    distanciaKm: item.distanciaKm,
    ratingAproximado: item.ratingAproximado,
    fuente: item.fuente,
    direccion: item.direccion,
    descripcionCorta: item.descripcionCorta || "",
    tieneFoto: Boolean(item.foto),
    tieneInstagram: Boolean(item.contacto?.instagramUrl),
    tieneWeb: Boolean(item.contacto?.sitioWeb),
  }));

  const response = await fetch(`${AI_RERANK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CHAT_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Sos un asistente de turismo local de alta precisión. Respondé SOLO JSON válido con forma {summary:string,tips:string[],pick_ids:string[]}. Reglas: no inventes lugares ni datos, usá solo IDs disponibles, mantené summary en 1-2 frases claras, tips accionables y sin relleno.",
        },
        {
          role: "user",
          content: JSON.stringify({
            message,
            zona,
            categoria,
            context,
            candidates,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  const parsed = parseJsonObjectFromText(content);
  if (!parsed) {
    return null;
  }

  const pickIds = Array.isArray(parsed?.pick_ids) ? parsed.pick_ids.map((id) => String(id)) : [];

  const byId = new Map(results.map((item) => [String(item.id), item]));
  const picks = pickIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 4)
    .map(toPickPayload);

  const fallbackPicks = defaultPicksFromResults(results, 3);
  const finalPicks = picks.length
    ? [...picks, ...fallbackPicks]
      .reduce((acc, item) => {
        if (!acc.some((existing) => String(existing.id) === String(item.id))) {
          acc.push(item);
        }
        return acc;
      }, [])
      .slice(0, 3)
    : fallbackPicks;
  const summary = cleanSentence(parsed?.summary || "");
  const finalSummary = summary.length >= 20 && summary.length <= 360
    ? summary
    : buildHeuristicSummary({ message, picks: finalPicks });
  const finalTips = sanitizeTips(parsed?.tips);

  return {
    summary: finalSummary,
    tips: finalTips.length
      ? finalTips
      : [
        "Arrancá por la opción con mejor combinación de cercanía y score.",
        "Antes de salir, abrí Maps para validar horarios y movimiento de la zona.",
      ],
    picks: finalPicks,
    provider: AI_CHAT_MODEL,
    aiEnabled: true,
  };
};

const askDiscoverAssistant = async ({
  message,
  zona = "",
  categoria = "all",
  lat,
  lng,
  radiusKm,
  candidates = [],
  context = {},
}) => {
  const normalizedMessage = String(message || "").trim();
  if (normalizedMessage.length < 3) {
    const error = new Error("El mensaje debe tener al menos 3 caracteres");
    error.statusCode = 400;
    throw error;
  }

  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const safeCandidates = Array.isArray(candidates) ? candidates : [];

  let results = safeCandidates;
  let location = null;

  if (!results.length) {
    const discover = await discoverPlaces({
      query: normalizedMessage,
      zona,
      categoria,
      limit: 12,
      lat: hasCoords ? Number(lat) : undefined,
      lng: hasCoords ? Number(lng) : undefined,
      radiusKm,
    });

    results = Array.isArray(discover.results) ? discover.results : [];
    location = discover.location || null;
  }

  const intentCategories = inferIntentCategories({ message: normalizedMessage, categoria });
  const alignedResults = getIntentAlignedResults({ results, intentCategories });

  try {
    const aiAnswer = await askAssistantWithAI({
      message: normalizedMessage,
      zona,
      categoria,
      results: alignedResults,
      context,
    });

    if (aiAnswer && (aiAnswer.summary || aiAnswer.picks.length)) {
      return {
        ...aiAnswer,
        location,
      };
    }
  } catch {
    // Fall back to deterministic answer.
  }

  return {
    ...heuristicAssistantAnswer({
      message: normalizedMessage,
      results: alignedResults,
      context,
    }),
    location,
  };
};

module.exports = {
  askDiscoverAssistant,
};
