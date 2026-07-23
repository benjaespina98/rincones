// Búsqueda de vinos conocidos contra APIs públicas gratuitas.
// Fuente principal: Open Food Facts (datos reales, imágenes, código de barras).
// Fallback: SampleAPIs (estático, siempre disponible) cuando OFF falla o no devuelve nada.

const OFF_BASE = "https://world.openfoodfacts.org";
const SAMPLE_BASE = "https://api.sampleapis.com/wines";
const REQUEST_TIMEOUT = 7000;

// Infiere el tipo de vino (claves de WINE_TYPE_LABELS) desde texto libre.
const guessType = (text = "") => {
  const t = text.toLowerCase();
  if (/(sparkl|espumante|champagne|prosecco|cava|spumante)/.test(t)) return "sparkling";
  if (/(ros[eé]|rosado)/.test(t)) return "rosé";
  if (/(white|blanc|blanco|chardonnay|sauvignon|riesling|torront)/.test(t)) return "white";
  if (/(port|sherry|fortif|oporto|jerez)/.test(t)) return "fortified";
  if (/(red|tinto|rouge|malbec|cabernet|merlot|syrah|tempranillo|pinot noir|bonarda)/.test(t))
    return "red";
  return "unknown";
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

// Extrae una añada (año 1900-2099) del texto si existe.
const parseVintage = (text = "") => {
  const m = String(text).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "";
};

const normalizeOff = (product) => {
  const name = (product.product_name || "").trim();
  if (!name) return null;
  const brand = (product.brands || "").split(",")[0]?.trim() || "";
  const region = (product.countries || "").split(",")[0]?.trim() || "";
  const image =
    product.image_front_small_url || product.image_small_url || product.image_url || "";
  return {
    id: `off-${product.code || name}`,
    name,
    winery: brand,
    region,
    image,
    vintage: parseVintage(name),
    varietal: "",
    rating: 0,
    type: guessType(`${product.categories || ""} ${name}`),
    barcode: product.code || "",
    source: "openfoodfacts",
  };
};

// Puntaje de calidad: priorizamos resultados con imagen y datos completos,
// para que las tarjetas se vean bien y los primeros sean los más útiles.
const qualityScore = (w) =>
  (w.image ? 3 : 0) + (w.winery ? 1.5 : 0) + (w.region ? 0.5 : 0) + (w.vintage ? 0.5 : 0);

const isUsableResult = (w) =>
  w &&
  w.name.length >= 3 &&
  !/^\d+$/.test(w.name) && // nombres que son solo números = ruido
  w.name.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 2; // requiere algo de texto real

const searchOpenFoodFacts = async (query) => {
  const params = new URLSearchParams({
    search_terms: query,
    tagtype_0: "categories",
    tag_contains_0: "contains",
    tag_0: "wines",
    fields: "code,product_name,brands,image_front_small_url,image_small_url,image_url,countries,categories",
    page_size: "40",
    json: "1",
  });
  const data = await fetchJson(`${OFF_BASE}/cgi/search.pl?${params.toString()}`);

  const seen = new Set();
  const items = (data.products || [])
    .map(normalizeOff)
    .filter(isUsableResult)
    .filter((w) => {
      // dedupe por nombre + bodega
      const key = `${w.name.toLowerCase()}|${w.winery.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  items.sort((a, b) => qualityScore(b) - qualityScore(a));
  return items.slice(0, 24);
};

// --- Fallback: SampleAPIs (cacheado en memoria por sesión) ---
let sampleCache = null;

const loadSample = async () => {
  if (sampleCache) return sampleCache;
  const cats = [
    ["reds", "red"],
    ["whites", "white"],
    ["sparkling", "sparkling"],
    ["rose", "rosé"],
  ];
  const results = await Promise.allSettled(
    cats.map(([cat]) => fetchJson(`${SAMPLE_BASE}/${cat}`))
  );
  const items = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) return;
    const type = cats[i][1];
    r.value.forEach((w) => {
      const name = (w.wine || "").trim();
      if (!name) return;
      const ratingAvg = Number.parseFloat(w.rating?.average);
      items.push({
        id: `sample-${type}-${w.id}`,
        name,
        winery: (w.winery || "").trim(),
        region: (w.location || "").replace(/\s+/g, " ").trim(),
        image: w.image || "",
        vintage: parseVintage(name),
        varietal: "",
        rating: Number.isFinite(ratingAvg) ? ratingAvg : 0,
        type,
        barcode: "",
        source: "sampleapis",
      });
    });
  });
  sampleCache = items;
  return items;
};

const searchSample = async (query) => {
  const all = await loadSample();
  const q = query.toLowerCase();
  return all
    .filter((w) => w.name.toLowerCase().includes(q) || w.winery.toLowerCase().includes(q))
    .slice(0, 24);
};

/**
 * Busca vinos conocidos por texto. Devuelve un array normalizado.
 * Intenta Open Food Facts; si falla o no hay resultados, usa SampleAPIs.
 */
export const searchWines = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  try {
    const offResults = await searchOpenFoodFacts(q);
    if (offResults.length > 0) return offResults;
  } catch {
    // OFF caído o abortado → fallback
  }

  try {
    return await searchSample(q);
  } catch {
    return [];
  }
};

/**
 * Busca un vino por código de barras (Open Food Facts). Útil para enriquecer el escaneo.
 */
export const getWineByBarcode = async (barcode) => {
  const code = String(barcode || "").trim();
  if (!code) return null;
  try {
    const data = await fetchJson(`${OFF_BASE}/api/v2/product/${code}.json`);
    if (data.status !== 1 || !data.product) return null;
    return normalizeOff({ ...data.product, code });
  } catch {
    return null;
  }
};
