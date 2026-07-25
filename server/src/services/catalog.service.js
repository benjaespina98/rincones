// Búsqueda de vinos "conocidos" para el alta rápida.
//
// Corre en el server por dos motivos:
//  1. Open Food Facts no manda cabeceras CORS, así que desde el browser fallaba
//     siempre y la UI mostraba "Sin resultados" ocultando un error de red.
//  2. Nos deja priorizar vino argentino, que es el foco de la app.
//
// Estrategia: el catálogo curado argentino manda; OFF sólo aporta resultados
// extra (con imagen y código de barras) y se ordena por debajo.

const { CATALOG, fold } = require("../data/argentineWines");
const { isAiSearchConfigured, searchWinesWithAi } = require("./wineAi.service");
const communityWines = require("./communityWines.service");
const CatalogSearch = require("../models/catalogSearch.model");

const OFF_BASE = "https://world.openfoodfacts.org";
const OFF_TIMEOUT = 6000;
const MAX_RESULTS = 24;

// Si el catálogo curado ya trae suficiente, no gastamos una llamada al modelo.
const AI_THRESHOLD = 4;
const AI_CACHE_DAYS = 30;

// Infiere el tipo de vino desde texto libre (mismas claves que WINE_TYPE_LABELS).
const guessType = (text = "") => {
  const t = fold(text);
  if (/(sparkl|espumante|champagne|prosecco|cava|spumante|brut)/.test(t)) return "sparkling";
  if (/(rose|rosado)/.test(t)) return "rosé";
  if (/(white|blanc|blanco|chardonnay|sauvignon|riesling|torront)/.test(t)) return "white";
  if (/(port|sherry|fortif|oporto|jerez)/.test(t)) return "fortified";
  if (/(red|tinto|rouge|malbec|cabernet|merlot|syrah|tempranillo|pinot noir|bonarda)/.test(t))
    return "red";
  return "unknown";
};

const parseVintage = (text = "") => {
  const m = String(text).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "";
};

// --- Catálogo argentino curado ---

// Puntaje por término: prioriza que empiece con lo buscado sobre que lo contenga,
// para que "catena" traiga primero la línea Catena y no un blend cualquiera.
const scoreEntry = (entry, terms) => {
  let score = 0;
  for (const term of terms) {
    const nameFolded = fold(entry.name);
    const wineryFolded = fold(entry.winery);

    if (nameFolded.startsWith(term)) score += 6;
    else if (nameFolded.includes(term)) score += 4;

    if (wineryFolded.startsWith(term)) score += 4;
    else if (wineryFolded.includes(term)) score += 3;

    if (fold(entry.varietal).includes(term)) score += 2;
    if (fold(entry.region).includes(term)) score += 1;
  }
  return score;
};

const searchCatalog = (query) => {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return CATALOG
    // Todos los términos tienen que aparecer en algún campo: "catena malbec"
    // no debe traer los Cabernet de Catena.
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => {
      const { haystack, ...rest } = entry;
      return { ...rest, score: scoreEntry(entry, terms) };
    })
    .sort((a, b) => b.score - a.score);
};

// --- Open Food Facts (complemento) ---

const normalizeOff = (product) => {
  const name = String(product.product_name || "").trim();
  if (!name) return null;

  const countries = String(product.countries || "");
  const brand = String(product.brands || "").split(",")[0]?.trim() || "";
  const image =
    product.image_front_small_url || product.image_small_url || product.image_url || "";

  return {
    id: `off-${product.code || name}`,
    name,
    winery: brand,
    region: countries.split(",")[0]?.trim() || "",
    varietal: "",
    type: guessType(`${product.categories || ""} ${name}`),
    image,
    vintage: parseVintage(name),
    rating: 0,
    barcode: product.code || "",
    country: /argentin/i.test(countries) ? "Argentina" : "",
    source: "openfoodfacts",
  };
};

// Descarta ruido: nombres muy cortos, puros números o sin letras reales.
const isUsable = (w) =>
  w &&
  w.name.length >= 3 &&
  !/^\d+$/.test(w.name) &&
  w.name.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 2;

const searchOpenFoodFacts = async (query) => {
  const params = new URLSearchParams({
    search_terms: query,
    tagtype_0: "categories",
    tag_contains_0: "contains",
    tag_0: "wines",
    fields:
      "code,product_name,brands,image_front_small_url,image_small_url,image_url,countries,categories",
    page_size: "40",
    json: "1",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT);
  try {
    const res = await fetch(`${OFF_BASE}/cgi/search.pl?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Rincones/1.0 (app de bodega personal)" },
    });
    if (!res.ok) throw new Error(`OFF respondió ${res.status}`);
    const data = await res.json();

    return (data.products || [])
      .map(normalizeOff)
      .filter(isUsable)
      // Los argentinos primero; con imagen antes que sin imagen.
      .map((w) => ({
        ...w,
        score: (w.country === "Argentina" ? 2 : 0) + (w.image ? 1 : 0),
      }));
  } finally {
    clearTimeout(timer);
  }
};

// --- Gemini (con caché) ---

// Devuelve resultados del modelo, usando Mongo como caché por consulta.
// Nunca lanza: si algo falla, la búsqueda sigue con lo que ya tenga.
const searchWithAiCached = async (query) => {
  const key = fold(query);

  try {
    const cached = await CatalogSearch.findOne({ query: key }).lean();
    if (cached) return cached.results || [];
  } catch {
    // Mongo caído o sin índice: seguimos, peor caso pagamos la consulta.
  }

  let results = [];
  try {
    results = await searchWinesWithAi(query);
  } catch {
    return [];
  }

  // Cacheamos incluso la lista vacía: si el modelo no conoce el vino hoy,
  // tampoco lo va a conocer en la próxima búsqueda idéntica.
  try {
    const expiresAt = new Date(Date.now() + AI_CACHE_DAYS * 24 * 60 * 60 * 1000);
    await CatalogSearch.updateOne(
      { query: key },
      { $set: { query: key, results, expiresAt } },
      { upsert: true }
    );
  } catch {
    // El caché es una optimización, no un requisito.
  }

  return results;
};

// --- API pública del servicio ---

// Orden de confianza de las fuentes: primero lo verificado a mano, después lo
// que cargó la comunidad, el modelo, y al final OFF (datos sucios en AR).
const SOURCE_RANK = { "catalogo-ar": 0, comunidad: 1, gemini: 2, openfoodfacts: 3 };

const dedupeAndRank = (lists) => {
  const seen = new Set();
  const merged = [];
  for (const wine of lists.flat()) {
    const key = `${fold(wine.name)}|${fold(wine.winery)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(wine);
  }
  merged.sort((a, b) => {
    const rankA = SOURCE_RANK[a.source] ?? 9;
    const rankB = SOURCE_RANK[b.source] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    return (b.score || 0) - (a.score || 0);
  });
  return merged.slice(0, MAX_RESULTS).map(({ score, haystack, ...wine }) => wine);
};

/**
 * Busca vinos por texto combinando fuentes:
 *   1. Catálogo argentino curado (instantáneo, verificado).
 *   2. Catálogo comunitario (vinos que cargaron los usuarios; crece con el uso).
 *   3. Gemini, sólo si lo anterior no alcanzó (cacheado en Mongo).
 *   4. Open Food Facts, best-effort, por imágenes y código de barras.
 */
const searchWines = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return { results: [], degraded: false };

  // Catálogo curado (sync) + comunitario (DB) en paralelo: ambos rápidos.
  const [local, community] = await Promise.all([
    Promise.resolve(searchCatalog(q)),
    communityWines.search(q).catch(() => []),
  ]);

  // Si entre lo curado y lo comunitario ya hay suficiente, cortamos acá y no
  // gastamos cuota de IA ni esperamos a fuentes externas.
  if (local.length + community.length >= AI_THRESHOLD) {
    return { results: dedupeAndRank([local, community]), degraded: false };
  }

  const [aiResults, offResult] = await Promise.all([
    isAiSearchConfigured() ? searchWithAiCached(q) : Promise.resolve([]),
    searchOpenFoodFacts(q).catch(() => null),
  ]);

  const external = offResult || [];
  const offFailed = offResult === null;
  const results = dedupeAndRank([local, community, aiResults, external]);
  return { results, degraded: offFailed && results.length === 0 };
};

// Selección de vinos destacados para la home "Descubrí". Sale del catálogo
// curado (instantáneo, sin gastar cuota de IA), variando por día para que rote.
const getFeatured = (count = 8) => {
  // Semilla diaria: mismo set durante el día, cambia cada jornada.
  const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const pool = [...CATALOG];
  // Barajado determinístico por la semilla del día.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = (daySeed * 9301 + i * 49297) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Diversificamos por bodega para no repetir la misma marca.
  const seenWinery = new Set();
  const picked = [];
  for (const wine of pool) {
    if (seenWinery.has(wine.winery)) continue;
    seenWinery.add(wine.winery);
    const { haystack, ...rest } = wine;
    picked.push(rest);
    if (picked.length >= count) break;
  }
  return picked;
};

module.exports = { searchWines, searchCatalog, guessType, getFeatured };
