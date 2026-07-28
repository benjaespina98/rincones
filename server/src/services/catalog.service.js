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
const { identityKey, composeDisplayName } = require("../data/wineIdentity");
const { isAiSearchConfigured, searchWinesWithAi } = require("./wineAi.service");
const communityWines = require("./communityWines.service");
const CatalogSearch = require("../models/catalogSearch.model");
const wineReviews = require("./wineReviews.service");

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

/**
 * Distancia de edición acotada: corta apenas supera `max`.
 *
 * No traemos una librería para esto. Son palabras de vino (10-15 caracteres) y
 * el corte temprano hace que la mayoría de las comparaciones terminen en las
 * primeras dos filas.
 */
const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
};

// Cuánto error se tolera según el largo: en una palabra de 4 letras una sola
// diferencia ya puede cambiar el vino, en una de 12 es claramente un dedazo.
const tolerance = (term) => (term.length <= 4 ? 0 : term.length <= 7 ? 1 : 2);

// ¿Algún token del haystack se parece lo suficiente al término?
const fuzzyHit = (tokens, term) => {
  const max = tolerance(term);
  if (max === 0) return false;
  return tokens.some((tok) => {
    // Sólo vale la pena comparar tokens de largo parecido.
    if (Math.abs(tok.length - term.length) > max) return false;
    return editDistance(tok, term, max) <= max;
  });
};

const searchCatalog = (query) => {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const rank = (entry, penalty) => {
    const { haystack, ...rest } = entry;
    return { ...rest, score: scoreEntry(entry, terms) - penalty };
  };

  // Paso 1 — coincidencia exacta. Todos los términos tienen que aparecer en
  // algún campo: "catena malbec" no debe traer los Cabernet de Catena.
  const exact = CATALOG
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => rank(entry, 0))
    .sort((a, b) => b.score - a.score);

  if (exact.length > 0) return exact;

  // Paso 2 — con un dedazo. Sólo si lo exacto no encontró nada: un error de
  // tipeo no debería costar una llamada al modelo ni un "sin resultados".
  // "catena zapta" y "malbek" caían acá y devolvían cero.
  return CATALOG
    .map((entry) => {
      const tokens = entry.haystack.split(/\s+/).filter(Boolean);
      let approx = 0;
      const ok = terms.every((term) => {
        if (entry.haystack.includes(term)) return true;
        if (fuzzyHit(tokens, term)) {
          approx += 1;
          return true;
        }
        return false;
      });
      // Lo aproximado siempre por debajo de lo exacto, y peor cuanto más lejos.
      return ok ? rank(entry, approx * 2) : null;
    })
    .filter(Boolean)
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

// Orden de confianza. El catálogo va primero no porque esté verificado contra
// una fuente oficial —no lo está, ver argentineWines.js— sino porque es estable
// y auditable: siempre devuelve lo mismo y se puede leer y corregir. Después lo
// que cargó gente real, después el modelo (que puede alucinar y cambia entre
// llamadas), y al final OFF, que en Argentina trae datos sucios.
const SOURCE_RANK = { "catalogo-ar": 0, comunidad: 1, gemini: 2, openfoodfacts: 3 };

// Clave canónica que reconcilia las distintas fuentes. Vive en wineIdentity.js
// para que la compartan la visión, la búsqueda IA y el catálogo curado.
const canonicalCore = identityKey;

// Adopta en `target` los campos ricos (foto, rating, precio, cosecha…) que le
// falten y sí tenga el duplicado `extra`. Así el resultado curado "hereda" la
// foto que cargó la comunidad, en vez de aparecer dos veces.
const mergeInto = (target, extra) => {
  if (!target.image && extra.image) target.image = extra.image;
  if (!(target.rating > 0) && extra.rating > 0) target.rating = extra.rating;
  if (!target.price && extra.price) target.price = extra.price;
  if (!target.vintage && extra.vintage) target.vintage = extra.vintage;
  if (!target.varietal && extra.varietal) target.varietal = extra.varietal;
  if (!target.region && extra.region) target.region = extra.region;
  if (!target.line && extra.line) target.line = extra.line;
  // El catálogo curado no tiene nota; si el mismo vino vino también del modelo,
  // se la queda. Es justo el caso donde la nota aporta: un vino verificado que
  // además trae una línea sobre a qué sabe.
  if (!target.note && extra.note) target.note = extra.note;
  target.score = Math.max(target.score || 0, extra.score || 0);
};

const dedupeAndRank = (lists) => {
  const byStrict = new Map(); // core|varietal|winery -> wine fusionado
  const looseIndex = new Map(); // core|winery -> strictKey canónico
  for (const wine of lists.flat()) {
    const { core, varietal, wineryToken } = canonicalCore(wine);
    const strict = `${core}|${varietal}|${wineryToken}`;
    const loose = `${core}|${wineryToken}`;

    if (byStrict.has(strict)) {
      mergeInto(byStrict.get(strict), wine);
      continue;
    }
    // Sin varietal no podemos distinguir la uva: lo absorbe el match del mismo
    // loose (nunca fusiona dos varietales conocidos distintos entre sí).
    if (!varietal && looseIndex.has(loose)) {
      mergeInto(byStrict.get(looseIndex.get(loose)), wine);
      continue;
    }
    byStrict.set(strict, { ...wine });
    if (varietal || !looseIndex.has(loose)) looseIndex.set(loose, strict);
  }

  const merged = [...byStrict.values()];
  merged.sort((a, b) => {
    const rankA = SOURCE_RANK[a.source] ?? 9;
    const rankB = SOURCE_RANK[b.source] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    // A igualdad de fuente, primero los que tienen foto.
    if (!!a.image !== !!b.image) return a.image ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });
  return merged.slice(0, MAX_RESULTS).map(({ score, haystack, ...wine }) => wine);
};

/**
 * Adosa el rating comunitario a cada resultado, en UNA sola consulta.
 *
 * El campo `rating` de las tarjetas existía pero siempre llegaba en 0 porque
 * ninguna fuente lo llenaba; ahora es el promedio real de las reseñas.
 */
const withReviews = async (results) => {
  if (!results?.length) return results;
  try {
    const summaries = await wineReviews.getSummaries(results);
    return results.map((w) => {
      const s = summaries.get(wineReviews.wineKey(w.name, w.winery));
      return s ? { ...w, rating: s.avg, reviewCount: s.count } : w;
    });
  } catch {
    return results;
  }
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
    return { results: await withReviews(dedupeAndRank([local, community])), degraded: false };
  }

  const [aiResults, offResult] = await Promise.all([
    isAiSearchConfigured() ? searchWithAiCached(q) : Promise.resolve([]),
    searchOpenFoodFacts(q).catch(() => null),
  ]);

  const external = offResult || [];
  const offFailed = offResult === null;
  const results = await withReviews(dedupeAndRank([local, community, aiResults, external]));
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

// --- Match seguro contra el catálogo (para enriquecer un escaneo) ---

// Similitud por conjunto de tokens: 1 = todos los tokens del más corto están en
// el más largo. Suficiente para "Catena" vs "Catena Zapata" sin traer una lib.
const tokenOverlap = (a, b) => {
  const ta = new Set(fold(a).split(/\s+/).filter(Boolean));
  const tb = new Set(fold(b).split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  return hits / Math.min(ta.size, tb.size);
};

const MATCH_THRESHOLD = 0.72;

/**
 * Busca en el catálogo el vino que corresponde a una lectura de etiqueta.
 *
 * Existe porque el cliente tomaba `results[0]` a ciegas y copiaba sus campos:
 * si Gemini leía bien el nombre pero el primer resultado era otra botella de la
 * misma bodega, el vino quedaba con la región/uva/cosecha equivocadas y el
 * usuario no se enteraba. Acá preferimos no devolver nada antes que mentir.
 */
const findMatch = async ({ winery, line, name, varietal, vintage } = {}) => {
  const query = composeDisplayName({ name, line, varietal, winery }) || name || "";
  if (String(query).trim().length < 2) return null;

  const { results } = await searchWines(query);
  if (!results?.length) return null;

  let best = null;
  for (const cand of results) {
    // Vetos duros: mejor no enriquecer que enriquecer mal.
    if (varietal && cand.varietal && fold(varietal) !== fold(cand.varietal)) continue;
    if (winery && cand.winery && tokenOverlap(winery, cand.winery) === 0) continue;

    const wineryScore = winery && cand.winery ? tokenOverlap(winery, cand.winery) : 0.5;
    const coreScore = tokenOverlap(line || name || query, cand.line || cand.name || "");
    const varietalScore = varietal && cand.varietal
      ? (fold(varietal) === fold(cand.varietal) ? 1 : 0)
      : 0.5;

    const score = 0.45 * wineryScore + 0.35 * coreScore + 0.2 * varietalScore;
    if (!best || score > best.score) best = { score, wine: cand };
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;
  // La cosecha nunca se adopta del catálogo: es propia de la botella.
  return { ...best.wine, vintage: vintage || best.wine.vintage || "", matchScore: Number(best.score.toFixed(2)) };
};

// Set de claves canónicas del catálogo curado, para saber si un vino ya está
// verificado (y no ensuciar el catálogo comunitario con un duplicado).
let curatedKeys = null;
const buildCuratedKeys = () => {
  const set = new Set();
  for (const w of CATALOG) {
    const { core, varietal, wineryToken } = canonicalCore(w);
    set.add(`${core}|${varietal}|${wineryToken}`);
  }
  return set;
};
const isCuratedWine = (wine) => {
  if (!curatedKeys) curatedKeys = buildCuratedKeys();
  const { core, varietal, wineryToken } = canonicalCore(wine);
  return curatedKeys.has(`${core}|${varietal}|${wineryToken}`);
};

module.exports = { searchWines, searchCatalog, guessType, getFeatured, isCuratedWine, findMatch };
