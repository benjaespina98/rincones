/**
 * Servicio de imágenes para vinos
 * Estrategia: local → Unsplash fallback con keywords → placeholder
 * Usa caché local para evitar búsquedas repetidas
 */

const UNSPLASH_API_KEY = import.meta.env.VITE_UNSPLASH_API_KEY || "";
const UNSPLASH_BASE_URL = "https://api.unsplash.com/search/photos";
const CACHE_KEY = "wine_images_cache";
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 días

// Placeholder SVG si nada funciona
const PLACEHOLDER_SVG =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="%238c61ff" width="200" height="300"/><text x="100" y="150" font-size="16" fill="white" text-anchor="middle" dominant-baseline="middle">🍷</text></svg>';

/**
 * Construye keywords de búsqueda para Unsplash basado en atributos del vino
 */
function buildSearchKeywords(wine) {
  const keywords = [];

  // Por tipo de vino
  if (wine.type) {
    keywords.push(wine.type === "red" ? "red wine" : wine.type === "white" ? "white wine" : wine.type);
  }

  // Por región (ej: Mendoza, Rioja, Napa)
  if (wine.region) {
    keywords.push(`${wine.region} wine`);
  }

  // Por varietal (ej: Malbec, Cabernet)
  if (wine.varietal) {
    keywords.push(wine.varietal);
  }

  // Fallback genérico
  if (keywords.length === 0) {
    keywords.push("wine bottle");
  }

  return keywords.join(" ");
}

/**
 * Obtiene caché local
 */
function getCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Error reading image cache:", err);
  }
  return {};
}

/**
 * Guarda en caché local
 */
function saveToCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn("Error saving image cache:", err);
  }
}

/**
 * Obtiene una imagen de Unsplash con keywords
 * Retorna URL de imagen o null si falla
 */
async function fetchFromUnsplash(keywords) {
  if (!UNSPLASH_API_KEY) {
    console.warn("VITE_UNSPLASH_API_KEY no configurada");
    return null;
  }

  try {
    const response = await fetch(
      `${UNSPLASH_BASE_URL}?query=${encodeURIComponent(keywords)}&per_page=1&client_id=${UNSPLASH_API_KEY}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.small; // Imagen pequeña optimizada
    }
  } catch (err) {
    console.error("Error fetching from Unsplash:", err);
  }

  return null;
}

/**
 * Obtiene la mejor imagen disponible para un vino
 * Prioridad: wine.image → caché → Unsplash → placeholder
 */
export async function getWineImage(wine) {
  // 1. Si el vino ya tiene una imagen, usa esa
  if (wine.image && wine.image.trim()) {
    return wine.image;
  }

  const cacheKey = buildSearchKeywords(wine);
  const cache = getCache();

  // 2. Chequea caché
  if (cache[cacheKey] && cache[cacheKey].expires > Date.now()) {
    return cache[cacheKey].url;
  }

  // 3. Busca en Unsplash
  const imageUrl = await fetchFromUnsplash(cacheKey);

  if (imageUrl) {
    // Guarda en caché
    cache[cacheKey] = {
      url: imageUrl,
      expires: Date.now() + CACHE_DURATION,
    };
    saveToCache(cache);
    return imageUrl;
  }

  // 4. Fallback a placeholder
  return PLACEHOLDER_SVG;
}

/**
 * Limpia caché de imágenes expiradas
 */
export function cleanExpiredCache() {
  const cache = getCache();
  const now = Date.now();
  let changed = false;

  for (const key in cache) {
    if (cache[key].expires < now) {
      delete cache[key];
      changed = true;
    }
  }

  if (changed) {
    saveToCache(cache);
  }
}

/**
 * Limpia todo el caché de imágenes
 */
export function clearImageCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn("Error clearing image cache:", err);
  }
}
