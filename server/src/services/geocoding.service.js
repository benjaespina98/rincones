const Lugar = require("../models/lugar.model");
const placesService = require("./places.service");

const NOMINATIM_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS || 7000);
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 6500);

const LOCATION_TYPE_PRIORITY = {
  neighbourhood: 10,
  suburb: 10,
  city_district: 9,
  city: 9,
  town: 8,
  village: 7,
  administrative: 7,
  county: 6,
  state: 5,
  road: 1,
  house: 0,
};

const getLocationPriority = (item = {}) => {
  const type = String(item.type || "").toLowerCase();
  const category = String(item.category || item.class || "").toLowerCase();
  const addresstype = String(item.addresstype || "").toLowerCase();
  const base = LOCATION_TYPE_PRIORITY[type] ?? LOCATION_TYPE_PRIORITY[addresstype] ?? 2;

  if (category === "boundary" || category === "place") {
    return base + 2;
  }

  return base;
};

const searchLocation = async (query) => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ar&q=${encodeURIComponent(`${query}, Argentina`)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "rincones-app/1.0 (geocoding-service)",
    },
    signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = new Error("No se pudo consultar el servicio de geocodificacion");
    error.statusCode = 502;
    throw error;
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const suggestions = results
    .slice()
    .sort((a, b) => getLocationPriority(b) - getLocationPriority(a))
    .map((item) => ({
      latitud: Number(item.lat),
      longitud: Number(item.lon),
      nombre: item.display_name,
      prioridad: getLocationPriority(item),
    }))
    .filter((item) => Number.isFinite(item.latitud) && Number.isFinite(item.longitud));

  if (suggestions.length === 0) {
    return null;
  }

  return {
    data: suggestions[0],
    suggestions,
  };
};

const reverseLocation = async ({ lat, lng }) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "rincones-app/1.0 (geocoding-service)",
    },
    signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = new Error("No se pudo resolver la ubicación actual");
    error.statusCode = 502;
    throw error;
  }

  const result = await response.json();
  return {
    latitud: Number(lat),
    longitud: Number(lng),
    nombre: result?.display_name || "Ubicación actual",
  };
};

const DISCOVER_CACHE_TTL_MS = 4 * 60 * 1000;
const discoverCache = new Map();
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const AI_RERANK_BASE_URL = String(process.env.AI_RERANK_BASE_URL || "https://openrouter.ai/api/v1").trim();
const AI_RERANK_MODEL = String(process.env.AI_RERANK_MODEL || "openai/gpt-4o-mini").trim();
const GOOGLE_PLACES_ENABLED = String(process.env.GOOGLE_PLACES_ENABLED || "false").trim().toLowerCase() === "true";
const GOOGLE_PLACES_API_KEY = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
const GOOGLE_PLACES_TIMEOUT_MS = Number(process.env.GOOGLE_PLACES_TIMEOUT_MS || 7000);
const WIKIPEDIA_TIMEOUT_MS = Number(process.env.WIKIPEDIA_TIMEOUT_MS || 4500);
const DEFAULT_FALLBACK_CENTER = {
  latitud: -31.4201,
  longitud: -64.1888,
  nombre: "Argentina",
};

const CATEGORIA_SELECTORS = {
  rio: ['["natural"="water"]', '["waterway"~"river|stream"]'],
  montana: ['["natural"="peak"]', '["natural"="cliff"]'],
  bar: ['["amenity"="bar"]', '["amenity"="pub"]'],
  cafeteria: ['["amenity"="cafe"]'],
  restaurante: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'],
  mirador: ['["tourism"="viewpoint"]'],
  turistico: ['["tourism"~"attraction|museum|gallery|theme_park"]'],
};

const DEFAULT_DISCOVER_SELECTORS = [
  '["amenity"~"bar|pub|restaurant|cafe"]',
  '["tourism"~"attraction|viewpoint|museum"]',
];

const INTENT_KEYWORDS = {
  rio: ["rio", "río", "costanera", "balneario", "laguna", "pesca", "mate"],
  montana: ["montana", "montaña", "cerro", "trekking", "sendero"],
  bar: ["bar", "birra", "cerveza", "vermú", "vermu", "trago", "coctel", "cocktail", "pub"],
  cafeteria: ["cafeteria", "cafetería", "cafe", "café", "merienda", "brunch"],
  restaurante: ["restaurante", "comida", "cena", "almuerzo", "tacos", "parrilla", "pizza", "hamburguesa", "sushi"],
  mirador: ["mirador", "vista", "panoramica", "panorámica"],
  turistico: ["turistico", "turístico", "paseo", "atraccion", "atracción", "visita"],
};

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const tokenize = (value = "") =>
  normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);

const normalizeCategoria = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const distanceInKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const getDiscoverQualityScore = (place) => {
  let score = Number(place.relevancia || 0);
  if (place.foto) score += 2;
  if (place.contacto?.sitioWeb) score += 1;
  if (place.contacto?.telefono) score += 1;
  if (place.contacto?.instagramUrl) score += 1;
  return score;
};

const isCommunitySource = (place) => normalizeText(place?.fuente).includes("comunidad");

const getSelectorsFromIntent = ({ normalizedCategoria, wantedCategories }) => {
  if (normalizedCategoria && normalizedCategoria !== "all") {
    return CATEGORIA_SELECTORS[normalizedCategoria] || DEFAULT_DISCOVER_SELECTORS;
  }

  if (wantedCategories?.size) {
    const intentSelectors = [...wantedCategories].flatMap((cat) => CATEGORIA_SELECTORS[cat] || []);
    if (intentSelectors.length) {
      return [...new Set(intentSelectors)];
    }
  }

  return DEFAULT_DISCOVER_SELECTORS;
};

const shouldUseWikipediaForQuery = ({ normalizedCategoria, query, wantedCategories }) => {
  if (normalizedCategoria === "bar" || normalizedCategoria === "cafeteria" || normalizedCategoria === "restaurante") {
    return false;
  }

  if (wantedCategories?.size) {
    const hasFoodOrNightlife = ["bar", "cafeteria", "restaurante"].some((cat) => wantedCategories.has(cat));
    const hasNatureOrTourism = ["rio", "montana", "mirador", "turistico"].some((cat) => wantedCategories.has(cat));
    if (hasFoodOrNightlife && !hasNatureOrTourism) {
      return false;
    }
  }

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  return /(rio|río|laguna|arroyo|cascada|cerro|montana|montaña|mirador|museo|historia|monumento|paseo|turistico|turístico)/.test(normalizedQuery);
};

const fetchOverpassElements = async ({ centerLat, centerLng, radiusMeters, selectors, limit }) => {
  const selectorQuery = selectors
    .map(
      (selector) =>
        `node(around:${radiusMeters},${centerLat},${centerLng})${selector};\n  way(around:${radiusMeters},${centerLat},${centerLng})${selector};\n  relation(around:${radiusMeters},${centerLat},${centerLng})${selector};`
    )
    .join("\n  ");

  const overpassQuery = `[out:json][timeout:15];\n(\n  ${selectorQuery}\n);\nout center ${limit};`;

  const requests = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent": "rincones-app/1.0 (discover-service)",
      },
      body: overpassQuery,
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error("overpass-unavailable");
    }

    const data = await response.json();
    if (!Array.isArray(data.elements) || data.elements.length === 0) {
      throw new Error("overpass-empty");
    }

    return data.elements;
  });

  try {
    return await Promise.any(requests);
  } catch {
    return [];
  }
};

const getNominatimViewbox = ({ centerLat, centerLng, radiusKm }) => {
  const safeRadiusKm = Math.min(Math.max(Number(radiusKm) || 8, 2), 60);
  const deltaLat = safeRadiusKm / 111;
  const latitudeCos = Math.cos(toRadians(centerLat));
  const deltaLng = safeRadiusKm / (111 * Math.max(0.25, Math.abs(latitudeCos)));

  const left = Number(centerLng) - deltaLng;
  const right = Number(centerLng) + deltaLng;
  const top = Number(centerLat) + deltaLat;
  const bottom = Number(centerLat) - deltaLat;

  return `${left},${top},${right},${bottom}`;
};

const fetchNominatimPlaces = async ({ query, zona, categoria, centerLat, centerLng, radiusKm, limit }) => {
  const baseText = [query, categoria !== "all" ? categoria : "", zona, "Argentina"].filter(Boolean).join(" ").trim();
  if (!baseText) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "ar",
      limit: String(Math.min(Math.max(Number(limit) || 12, 6), 24)),
      q: baseText,
    });

    if (Number.isFinite(Number(centerLat)) && Number.isFinite(Number(centerLng))) {
      params.set("viewbox", getNominatimViewbox({ centerLat, centerLng, radiusKm }));
      params.set("bounded", "1");
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept-Language": "es",
        "User-Agent": "rincones-app/1.0 (discover-nominatim)",
      },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item) => {
        const latitud = Number(item.lat);
        const longitud = Number(item.lon);
        if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
          return null;
        }

        const inferredCategory = inferCategoria({
          amenity: item.type,
          tourism: item.type,
          natural: item.type,
          waterway: item.type,
        });

        return {
          id: `nominatim-${String(item.place_id || "")}`,
          nombre: String(item.display_name || item.name || "").split(",")[0] || "Lugar",
          categoria: inferredCategory,
          ciudad: zona || "",
          direccion: String(item.display_name || "").trim(),
          distanciaKm: Number.isFinite(Number(centerLat)) && Number.isFinite(Number(centerLng))
            ? Number(distanceInKm(Number(centerLat), Number(centerLng), latitud, longitud).toFixed(1))
            : null,
          ubicacion: {
            latitud,
            longitud,
          },
          contacto: {
            telefono: "",
            sitioWeb: "",
            instagram: "",
            instagramUrl: "",
          },
          foto: "",
          fuente: "OpenStreetMap Nominatim",
          osmUrl: item.osm_type && item.osm_id ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}` : "",
          ratingAproximado: 3.6,
          relevancia: 8,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const fetchWikipediaPlaces = async ({ query, centerLat, centerLng, radiusKm, limit, zona }) => {
  if (!Number.isFinite(Number(centerLat)) || !Number.isFinite(Number(centerLng))) {
    return [];
  }

  const safeRadiusMeters = Math.round(Math.min(Math.max(Number(radiusKm) || 8, 2), 60) * 1000);
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 6), 24);

  try {
    const geoParams = new URLSearchParams({
      action: "query",
      list: "geosearch",
      gscoord: `${Number(centerLat)}|${Number(centerLng)}`,
      gsradius: String(Math.min(Math.max(safeRadiusMeters, 1000), 10000)),
      gslimit: String(Math.min(safeLimit, 20)),
      format: "json",
      origin: "*",
    });

    const geoResponse = await fetch(`https://es.wikipedia.org/w/api.php?${geoParams.toString()}`, {
      headers: {
        "User-Agent": "rincones-app/1.0 (discover-wikipedia)",
      },
      signal: AbortSignal.timeout(WIKIPEDIA_TIMEOUT_MS),
    });

    if (!geoResponse.ok) {
      return [];
    }

    const geoPayload = await geoResponse.json();
    const geoItems = Array.isArray(geoPayload?.query?.geosearch) ? geoPayload.query.geosearch : [];
    if (!geoItems.length) {
      return [];
    }

    const pageIds = geoItems.map((item) => Number(item.pageid)).filter(Number.isFinite);
    const detailsParams = new URLSearchParams({
      action: "query",
      pageids: pageIds.join("|"),
      prop: "extracts|pageimages|info",
      inprop: "url",
      exintro: "1",
      explaintext: "1",
      pithumbsize: "640",
      format: "json",
      origin: "*",
    });

    const detailsResponse = await fetch(`https://es.wikipedia.org/w/api.php?${detailsParams.toString()}`, {
      headers: {
        "User-Agent": "rincones-app/1.0 (discover-wikipedia)",
      },
      signal: AbortSignal.timeout(WIKIPEDIA_TIMEOUT_MS),
    });

    const detailsPayload = detailsResponse.ok ? await detailsResponse.json() : { query: { pages: {} } };
    const pagesMap = detailsPayload?.query?.pages || {};
    const normalizedQuery = normalizeText(query);

    return geoItems
      .map((item) => {
        const page = pagesMap[String(item.pageid)] || {};
        const title = String(item.title || "").trim();
        if (!title) {
          return null;
        }

        const extract = String(page.extract || "").trim();
        const address = [title, zona || ""].filter(Boolean).join(", ");
        const inferredCategory = inferCategoria({
          tourism: /mirador|vista|attract|museo|monumento|parque/i.test(`${title} ${extract}`) ? "attraction" : "",
          natural: /rio|lago|laguna|cerro|montana|montaña|reserva/i.test(`${title} ${extract}`) ? "water" : "",
        });

        let relevancia = 10;
        if (normalizedQuery) {
          const text = normalizeText(`${title} ${extract}`);
          if (text.includes(normalizedQuery)) {
            relevancia += 8;
          }
        }

        const distanciaKm = Number.isFinite(Number(item.dist)) ? Number((Number(item.dist) / 1000).toFixed(1)) : null;
        if (Number.isFinite(distanciaKm) && distanciaKm <= 2.5) {
          relevancia += 4;
        }

        return {
          id: `wiki-${String(item.pageid)}`,
          nombre: title,
          categoria: inferredCategory,
          ciudad: zona || "",
          direccion: address,
          distanciaKm,
          ubicacion: {
            latitud: Number(item.lat),
            longitud: Number(item.lon),
          },
          contacto: {
            telefono: "",
            sitioWeb: String(page.fullurl || "").trim(),
            instagram: "",
            instagramUrl: "",
          },
          foto: String(page.thumbnail?.source || "").trim(),
          fuente: "Wikipedia",
          osmUrl: String(page.fullurl || "").trim(),
          ratingAproximado: Number(Math.min(4.8, 3.7 + relevancia / 20).toFixed(1)),
          relevancia,
          descripcionCorta: extract ? extract.slice(0, 240) : "",
        };
      })
      .filter((item) => item && Number.isFinite(item.ubicacion?.latitud) && Number.isFinite(item.ubicacion?.longitud));
  } catch {
    return [];
  }
};

const categoriaToGoogleType = (categoria = "") => {
  const normalized = normalizeCategoria(categoria);

  switch (normalized) {
    case "cafeteria":
      return "cafe";
    case "restaurante":
      return "restaurant";
    case "bar":
      return "bar";
    case "mirador":
      return "tourist_attraction";
    case "rio":
      return "park";
    default:
      return "";
  }
};

const inferCategoriaFromGoogleTypes = (types = []) => {
  const normalizedTypes = Array.isArray(types) ? types.map((item) => normalizeText(item)) : [];

  if (normalizedTypes.includes("cafe")) return "cafeteria";
  if (normalizedTypes.includes("restaurant") || normalizedTypes.includes("meal_takeaway")) return "restaurante";
  if (normalizedTypes.includes("bar") || normalizedTypes.includes("night_club")) return "bar";
  if (normalizedTypes.includes("tourist_attraction") || normalizedTypes.includes("museum")) return "turistico";
  if (normalizedTypes.includes("park") || normalizedTypes.includes("natural_feature")) return "rio";
  return "turistico";
};

const fetchGooglePlaces = async ({ query, zona, categoria, centerLat, centerLng, radiusKm, limit }) => {
  if (!GOOGLE_PLACES_ENABLED || !GOOGLE_PLACES_API_KEY) {
    return [];
  }

  if (!Number.isFinite(Number(centerLat)) || !Number.isFinite(Number(centerLng))) {
    return [];
  }

  const safeRadius = Math.min(Math.max(Math.round((Number(radiusKm) || 8) * 1000), 1500), 50000);
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 6), 20);
  const params = new URLSearchParams({
    location: `${Number(centerLat)},${Number(centerLng)}`,
    radius: String(safeRadius),
    language: "es",
    key: GOOGLE_PLACES_API_KEY,
  });

  const keyword = [query, zona].filter(Boolean).join(" ").trim();
  if (keyword) {
    params.set("keyword", keyword);
  }

  const type = categoriaToGoogleType(categoria);
  if (type) {
    params.set("type", type);
  }

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`, {
      headers: {
        "User-Agent": "rincones-app/1.0 (discover-google-places)",
      },
      signal: AbortSignal.timeout(GOOGLE_PLACES_TIMEOUT_MS),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (!Array.isArray(payload.results)) {
      return [];
    }

    const normalizedQuery = normalizeText(query);

    return payload.results
      .slice(0, safeLimit)
      .map((item) => {
        const latitud = Number(item.geometry?.location?.lat);
        const longitud = Number(item.geometry?.location?.lng);
        if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
          return null;
        }

        const nombre = String(item.name || "").trim();
        if (!nombre) {
          return null;
        }

        const distanciaKm = Number(distanceInKm(Number(centerLat), Number(centerLng), latitud, longitud).toFixed(1));
        const rating = Number(item.rating);
        const totalRatings = Number(item.user_ratings_total);
        const types = Array.isArray(item.types) ? item.types : [];
        const text = normalizeText(`${nombre} ${item.vicinity || ""} ${types.join(" ")}`);
        let relevancia = 8;

        if (normalizedQuery && text.includes(normalizedQuery)) {
          relevancia += 7;
        }
        if (Number.isFinite(rating)) {
          relevancia += Math.round(rating);
        }
        if (Number.isFinite(totalRatings) && totalRatings > 30) {
          relevancia += 3;
        }
        if (distanciaKm <= 2) {
          relevancia += 3;
        }

        const photoRef = String(item.photos?.[0]?.photo_reference || "").trim();
        const foto = photoRef
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=640&photo_reference=${encodeURIComponent(photoRef)}&key=${GOOGLE_PLACES_API_KEY}`
          : "";

        return {
          id: `google-${String(item.place_id || item.name || `${latitud}-${longitud}`)}`,
          nombre,
          categoria: inferCategoriaFromGoogleTypes(types),
          ciudad: zona || "",
          direccion: String(item.vicinity || "").trim(),
          distanciaKm,
          ubicacion: {
            latitud,
            longitud,
          },
          contacto: {
            telefono: "",
            sitioWeb: "",
            instagram: "",
            instagramUrl: "",
          },
          foto,
          fuente: "Google Places",
          osmUrl: String(item.place_id || "").trim()
            ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(item.place_id)}`
            : "",
          ratingAproximado: Number.isFinite(rating) ? Number(Math.min(5, Math.max(0, rating)).toFixed(1)) : 4,
          relevancia,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const rerankWithAIIfEnabled = async ({ query, locationName, results }) => {
  const apiKey = String(process.env.AI_RERANK_API_KEY || "").trim();
  if (!apiKey || !Array.isArray(results) || results.length < 4) {
    return {
      results,
      aiReranked: false,
      aiProvider: "disabled",
    };
  }

  try {
    const candidates = results.slice(0, Math.min(results.length, 18)).map((item) => ({
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
      distanciaKm: item.distanciaKm,
      ratingAproximado: item.ratingAproximado,
      fuente: item.fuente,
      direccion: item.direccion,
      tieneFoto: Boolean(item.foto),
      tieneSitio: Boolean(item.contacto?.sitioWeb),
      tieneInstagram: Boolean(item.contacto?.instagramUrl),
    }));

    const response = await fetch(`${AI_RERANK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_RERANK_MODEL,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "Sos un ranker de resultados de lugares. Devolvé SOLO JSON válido con forma {\"ordered_ids\":[...]} usando únicamente IDs existentes.",
          },
          {
            role: "user",
            content: JSON.stringify({
              query,
              location: locationName || "",
              objective: "Priorizar lugares relevantes, lindos/recomendables y con buena calidad de info para una persona que quiere salir.",
              candidates,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        results,
        aiReranked: false,
        aiProvider: "http-error",
      };
    }

    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || "").trim();
    const jsonText = content.includes("{") ? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1) : "";
    const parsed = jsonText ? JSON.parse(jsonText) : null;
    const orderedIds = Array.isArray(parsed?.ordered_ids) ? parsed.ordered_ids.map((id) => String(id)) : [];

    if (!orderedIds.length) {
      return {
        results,
        aiReranked: false,
        aiProvider: "invalid-response",
      };
    }

    const byId = new Map(results.map((item) => [String(item.id), item]));
    const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    const rest = results.filter((item) => !orderedIds.includes(String(item.id)));

    return {
      results: [...ordered, ...rest],
      aiReranked: true,
      aiProvider: AI_RERANK_MODEL,
    };
  } catch {
    return {
      results,
      aiReranked: false,
      aiProvider: "error",
    };
  }
};

const isLikelyDuplicatePlace = (candidate, existing) => {
  const candidateName = normalizeText(candidate.nombre);
  const existingName = normalizeText(existing.nombre);
  if (!candidateName || candidateName !== existingName) {
    return false;
  }

  const candidateAddress = normalizeText(candidate.direccion);
  const existingAddress = normalizeText(existing.direccion);
  if (candidateAddress && existingAddress) {
    return candidateAddress === existingAddress;
  }

  const candidateLat = Number(candidate.ubicacion?.latitud);
  const candidateLng = Number(candidate.ubicacion?.longitud);
  const existingLat = Number(existing.ubicacion?.latitud);
  const existingLng = Number(existing.ubicacion?.longitud);

  if (![candidateLat, candidateLng, existingLat, existingLng].every(Number.isFinite)) {
    return false;
  }

  // Same venue often appears as both node and way in OSM with nearby coordinates.
  return distanceInKm(candidateLat, candidateLng, existingLat, existingLng) <= 0.12;
};

const inferCategoria = (tags = {}) => {
  const amenity = String(tags.amenity || "").toLowerCase();
  const tourism = String(tags.tourism || "").toLowerCase();
  const natural = String(tags.natural || "").toLowerCase();
  const waterway = String(tags.waterway || "").toLowerCase();

  if (["bar", "pub"].includes(amenity)) return "bar";
  if (amenity === "cafe") return "cafeteria";
  if (["restaurant", "fast_food"].includes(amenity)) return "restaurante";
  if (tourism === "viewpoint") return "mirador";
  if (["attraction", "museum", "gallery", "theme_park"].includes(tourism)) return "turistico";
  if (["water"].includes(natural) || ["river", "stream"].includes(waterway)) return "rio";
  if (["peak", "cliff"].includes(natural)) return "montana";
  return "turistico";
};

const buildInstagramUrl = (value = "") => {
  const raw = String(value).trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const handle = raw.replace(/^@/, "").trim();
  return handle ? `https://instagram.com/${handle}` : "";
};

const buildAddress = (tags = {}) => {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
  const parts = [street, city].filter(Boolean);
  return parts.length ? parts.join(", ") : tags["addr:full"] || "";
};

const getPhotoFromTags = (tags = {}) => {
  const directImage = String(tags.image || "").trim();
  if (directImage.startsWith("http://") || directImage.startsWith("https://")) {
    return directImage;
  }

  const commons = String(tags.wikimedia_commons || "").trim();
  if (commons) {
    const fileName = commons.replace(/^File:/i, "");
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=640`;
  }

  return "";
};

const getPrimaryImage = (imagenes = []) => {
  if (!Array.isArray(imagenes) || !imagenes.length) {
    return "";
  }

  return String(imagenes[0] || "").trim();
};

const inferWantedCategories = (query, categoria) => {
  const normalizedCategoria = normalizeCategoria(categoria);
  if (normalizedCategoria && normalizedCategoria !== "all") {
    return new Set([normalizedCategoria]);
  }

  const tokens = tokenize(query);
  const wanted = new Set();

  Object.entries(INTENT_KEYWORDS).forEach(([cat, keywords]) => {
    const hasMatch = keywords.some((word) => {
      const normalizedWord = normalizeText(word);
      return tokens.some((token) => token.includes(normalizedWord) || normalizedWord.includes(token));
    });

    if (hasMatch) {
      wanted.add(cat);
    }
  });

  return wanted;
};

const inferIntentSignal = (query, categoria) => {
  const normalizedCategoria = normalizeCategoria(categoria);
  const wantedCategories = inferWantedCategories(query, categoria);
  const normalizedQuery = normalizeText(query);

  if (normalizedCategoria && normalizedCategoria !== "all") {
    return {
      wantedCategories,
      strongIntent: true,
    };
  }

  if (!normalizedQuery || wantedCategories.size === 0) {
    return {
      wantedCategories,
      strongIntent: false,
    };
  }

  const keywordHits = [...wantedCategories].reduce((acc, cat) => {
    const keywords = Array.isArray(INTENT_KEYWORDS[cat]) ? INTENT_KEYWORDS[cat] : [];
    const hasHit = keywords.some((word) => normalizedQuery.includes(normalizeText(word)));
    return acc + (hasHit ? 1 : 0);
  }, 0);

  return {
    wantedCategories,
    strongIntent: keywordHits >= 1,
  };
};

const hasDirectQueryMatch = ({ query, item }) => {
  const tokens = tokenize(query).filter((token) => token.length >= 3);
  if (!tokens.length) {
    return false;
  }

  const searchableText = normalizeText([
    item?.nombre,
    item?.direccion,
    item?.ciudad,
    item?.categoria,
  ].filter(Boolean).join(" "));

  return tokens.some((token) => searchableText.includes(token));
};

const scorePlace = ({ query, wantedCategories, itemCategoria, tags, nombre, direccion, foto, instagram, distanceKm, strictIntent }) => {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const baseText = normalizeText([
    nombre,
    direccion,
    tags.amenity,
    tags.tourism,
    tags.cuisine,
    tags.description,
  ].join(" "));
  const normalizedName = normalizeText(nombre);

  let score = 0;

  queryTokens.forEach((token) => {
    if (normalizedName.includes(token)) {
      score += 8;
    }
    if (baseText.includes(token)) {
      score += 3;
    }
  });

  if (wantedCategories.size > 0) {
    if (wantedCategories.has(itemCategoria)) {
      score += strictIntent ? 18 : 14;
    } else {
      score -= strictIntent ? 26 : 14;
    }
  }

  const amenities = normalizeText(tags.amenity);
  const cuisine = normalizeText(tags.cuisine);
  if (normalizedQuery.includes("taco") && cuisine.includes("mexican")) {
    score += 10;
  }
  if ((normalizedQuery.includes("vermu") || normalizedQuery.includes("vermut")) && ["bar", "pub"].includes(amenities)) {
    score += 7;
  }

  if (tags.website || tags["contact:website"]) score += 2;
  if (tags.phone || tags["contact:phone"]) score += 1;
  if (tags.opening_hours) score += 1;
  if (tags.wikipedia || tags.wikidata) score += 2;
  if (foto) score += 2;
  if (instagram) score += 2;

  if (Number.isFinite(distanceKm)) {
    if (distanceKm <= 1.5) score += 8;
    else if (distanceKm <= 4) score += 5;
    else if (distanceKm <= 8) score += 3;
    else if (distanceKm >= 15) score -= 4;
  }

  const ratingAproximado = Math.max(2.6, Math.min(5, 2.8 + score / 12));
  return {
    score,
    ratingAproximado: Number(ratingAproximado.toFixed(1)),
  };
};

const normalizeAggregatedSource = (source = "") => {
  const normalized = normalizeText(source);

  if (normalized === "community" || normalized.startsWith("community-fallback")) {
    return "Comunidad Rincones";
  }
  if (normalized === "foursquare") {
    return "Foursquare";
  }
  if (normalized === "google-places") {
    return "Google Places";
  }
  if (normalized === "cache") {
    return "Cache multicapa";
  }
  if (normalized === "openstreetmap" || normalized === "osm-fallback") {
    return "OpenStreetMap";
  }

  return source || "Fuentes externas";
};

const getSourceReliabilityBoost = (source = "") => {
  const normalized = normalizeText(source);

  if (normalized === "foursquare") return 9;
  if (normalized === "google-places") return 8;
  if (normalized === "community" || normalized.startsWith("community-fallback")) return 7;
  if (normalized === "cache") return 5;
  if (normalized === "openstreetmap" || normalized === "osm-fallback") return 4;

  return 3;
};

const mapAggregatedPlaceToDiscover = ({ place, location, query, wantedCategories, centerLat, centerLng }) => {
  const nombre = String(place?.name || "").trim();
  const latitud = Number(place?.latitude);
  const longitud = Number(place?.longitude);

  if (!nombre || !Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return null;
  }

  const itemCategoria = normalizeCategoria(place?.category) || "turistico";
  const distanciaKm = Number.isFinite(Number(place?.distance))
    ? Number((Number(place.distance) / 1000).toFixed(1))
    : Number(distanceInKm(Number(centerLat), Number(centerLng), latitud, longitud).toFixed(1));
  const scoreData = scorePlace({
    query,
    wantedCategories,
    itemCategoria,
    strictIntent: wantedCategories.size > 0,
    tags: {
      amenity: itemCategoria,
      tourism: itemCategoria,
      description: place?.rawCategory || "",
      website: "",
      phone: "",
    },
    nombre,
    direccion: String(place?.address || "").trim(),
    foto: "",
    instagram: "",
    distanceKm: distanciaKm,
  });
  const source = String(place?.source || "");
  const ratingFromProvider = Number(place?.rating);
  const ratingAproximado = Number.isFinite(ratingFromProvider)
    ? Number(Math.max(0, Math.min(5, ratingFromProvider)).toFixed(1))
    : scoreData.ratingAproximado;

  return {
    id: `agg-${source || "external"}-${String(place?.id || `${latitud}-${longitud}`)}`,
    nombre,
    categoria: itemCategoria,
    ciudad: location?.nombre || "",
    direccion: String(place?.address || "").trim(),
    distanciaKm,
    ubicacion: {
      latitud,
      longitud,
    },
    contacto: {
      telefono: "",
      sitioWeb: "",
      instagram: "",
      instagramUrl: "",
    },
    foto: "",
    fuente: normalizeAggregatedSource(source),
    osmUrl: "",
    ratingAproximado,
    relevancia: scoreData.score + getSourceReliabilityBoost(source),
  };
};

const discoverPlaces = async ({ query, zona = "", categoria = "all", limit = 20, lat, lng, radiusKm }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 6), 24);
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const requestedRadiusKm = Number(radiusKm);
  const safeRadiusKm = Number.isFinite(requestedRadiusKm)
    ? Math.min(Math.max(requestedRadiusKm, 2), 80)
    : hasCoords
      ? 8
      : 22;
  const aroundRadiusMeters = Math.round(safeRadiusKm * 1000);
  const cacheKey = `${normalizeCategoria(query)}|${normalizeCategoria(zona)}|${normalizeCategoria(categoria)}|${safeLimit}|${
    hasCoords ? `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}` : "no-coords"
  }|${safeRadiusKm}`;
  const cached = discoverCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < DISCOVER_CACHE_TTL_MS) {
    return cached.payload;
  }

  let location = null;
  let centerLat;
  let centerLng;

  if (hasCoords) {
    centerLat = Number(lat);
    centerLng = Number(lng);
    try {
      location = await reverseLocation({ lat: centerLat, lng: centerLng });
    } catch {
      location = {
        latitud: centerLat,
        longitud: centerLng,
        nombre: "Ubicación actual",
      };
    }
  } else {
    let locationResult = null;
    try {
      locationResult = await searchLocation(zona || query);
    } catch {
      locationResult = null;
    }

    if (!locationResult?.data) {
      centerLat = Number(DEFAULT_FALLBACK_CENTER.latitud);
      centerLng = Number(DEFAULT_FALLBACK_CENTER.longitud);
      location = {
        latitud: centerLat,
        longitud: centerLng,
        nombre: zona || DEFAULT_FALLBACK_CENTER.nombre,
      };
    } else {
      centerLat = Number(locationResult.data.latitud);
      centerLng = Number(locationResult.data.longitud);
      location = locationResult.data;
    }
  }

  const normalizedCategoria = normalizeCategoria(categoria);
  const hasQuery = normalizeText(query).length > 0;
  const intentSignal = inferIntentSignal(query, categoria);
  const wantedCategories = intentSignal.wantedCategories;
  const strictIntent = Boolean(intentSignal.strongIntent && wantedCategories.size > 0);
  const enableWikipedia = shouldUseWikipediaForQuery({ normalizedCategoria, query, wantedCategories });
  const selectors = getSelectorsFromIntent({ normalizedCategoria, wantedCategories });

  const toExternalResults = (elements = []) =>
    elements
    .map((element) => {
      const elLat = Number(element.lat ?? element.center?.lat);
      const elLng = Number(element.lon ?? element.center?.lon);
      const tags = element.tags || {};
      const nombre = String(tags.name || "").trim();

      if (!nombre || !Number.isFinite(elLat) || !Number.isFinite(elLng)) {
        return null;
      }

      return {
        id: `${element.type}-${element.id}`,
        nombre,
        categoria: inferCategoria(tags),
        ciudad: location.nombre,
        direccion: buildAddress(tags),
        distanciaKm: Number(distanceInKm(centerLat, centerLng, elLat, elLng).toFixed(1)),
        ubicacion: {
          latitud: elLat,
          longitud: elLng,
        },
        contacto: {
          telefono: tags.phone || tags["contact:phone"] || "",
          sitioWeb: tags.website || tags["contact:website"] || "",
          instagram: tags["contact:instagram"] || tags.instagram || "",
        },
        foto: getPhotoFromTags(tags),
        fuente: "OpenStreetMap",
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        _tags: tags,
      };
    })
    .filter(Boolean)
    .map((item) => {
      const scoreData = scorePlace({
        query,
        wantedCategories,
        itemCategoria: item.categoria,
        strictIntent,
        tags: item._tags || {},
        nombre: item.nombre,
        direccion: item.direccion,
        foto: item.foto,
        instagram: item.contacto?.instagram,
        distanceKm: item.distanciaKm,
      });

      return {
        ...item,
        contacto: {
          ...item.contacto,
          instagramUrl: buildInstagramUrl(item.contacto?.instagram),
        },
        ratingAproximado: scoreData.ratingAproximado,
        relevancia: scoreData.score,
      };
    })
    .map(({ _tags, ...item }) => item);

  const communityDocsPromise = Lugar.find({}, { __v: 0 }).sort({ creadoEn: -1 }).limit(500).lean();
  const overpassPromise = fetchOverpassElements({
    centerLat,
    centerLng,
    radiusMeters: aroundRadiusMeters,
    selectors,
    limit: safeLimit,
  });
  const wikipediaPromise = enableWikipedia
    ? fetchWikipediaPlaces({
      query,
      centerLat,
      centerLng,
      radiusKm: safeRadiusKm,
      limit: safeLimit,
      zona: location?.nombre || zona,
    })
    : Promise.resolve([]);
  const googlePromise = fetchGooglePlaces({
    query,
    zona: location?.nombre || zona,
    categoria: normalizedCategoria,
    centerLat,
    centerLng,
    radiusKm: safeRadiusKm,
    limit: safeLimit,
  });
  const nominatimPromise = fetchNominatimPlaces({
    query,
    zona: location?.nombre || zona,
    categoria: normalizedCategoria,
    centerLat,
    centerLng,
    radiusKm: safeRadiusKm,
    limit: safeLimit,
  });
  const aggregatorPromise = placesService
    .getNearbyPlaces({
      lat: centerLat,
      lng: centerLng,
      radius: aroundRadiusMeters,
      category: normalizedCategoria || "all",
    })
    .catch(() => null);

  const [initialElements, wikipediaExternal, googleExternal, aggregatedNearby] = await Promise.all([
    overpassPromise,
    wikipediaPromise,
    googlePromise,
    aggregatorPromise,
  ]);

  const externalResults = toExternalResults(initialElements);
  const aggregatedExternal = Array.isArray(aggregatedNearby?.places)
    ? aggregatedNearby.places
      .map((place) =>
        mapAggregatedPlaceToDiscover({
          place,
          location,
          query,
          wantedCategories,
          centerLat,
          centerLng,
        })
      )
      .filter(Boolean)
    : [];
  const nominatimExternal = aggregatedExternal.length + externalResults.length + wikipediaExternal.length + googleExternal.length >= Math.ceil(safeLimit * 0.6)
    ? []
    : await nominatimPromise;

  const normalizedZona = normalizeText(zona);
  const communityMaxDistanceKm = Math.max(safeRadiusKm * 1.5, hasCoords ? 10 : 18);

  const communityDocs = await communityDocsPromise;

  const communityResults = communityDocs
    .map((lugar) => {
      const itemCategoria = normalizeCategoria(lugar.categoria);
      if (normalizedCategoria && normalizedCategoria !== "all" && itemCategoria !== normalizedCategoria) {
        return null;
      }

      if (strictIntent && !wantedCategories.has(itemCategoria)) {
        return null;
      }

      const latitud = Number(lugar.ubicacion?.latitud);
      const longitud = Number(lugar.ubicacion?.longitud);
      if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
        return null;
      }

      const distanciaKm = Number(distanceInKm(centerLat, centerLng, latitud, longitud).toFixed(1));
      const cityAddressText = normalizeText([lugar.ciudad, lugar.direccion].filter(Boolean).join(" "));
      const matchesZona = normalizedZona ? cityAddressText.includes(normalizedZona) : true;
      const withinDistance = distanciaKm <= communityMaxDistanceKm;

      if (hasCoords && !withinDistance) {
        return null;
      }

      if (!hasCoords && !withinDistance && !matchesZona) {
        return null;
      }

      const foto = getPrimaryImage(lugar.imagenes);
      const instagram = lugar.contacto?.instagram || "";
      const scoreData = scorePlace({
        query,
        wantedCategories,
        itemCategoria,
        strictIntent,
        tags: {
          amenity: itemCategoria,
          tourism: itemCategoria,
          description: lugar.descripcion || "",
          website: lugar.contacto?.sitioWeb || "",
          phone: lugar.contacto?.telefono || "",
        },
        nombre: lugar.nombre,
        direccion: lugar.direccion,
        foto,
        instagram,
        distanceKm: distanciaKm,
      });

      const ratingFromCommunity = Number(lugar.rating);
      const ratingAproximado =
        Number.isFinite(ratingFromCommunity) && ratingFromCommunity > 0
          ? Number(Math.min(5, Math.max(0, ratingFromCommunity)).toFixed(1))
          : scoreData.ratingAproximado;

      return {
        id: `local-${String(lugar._id)}`,
        nombre: lugar.nombre,
        categoria: itemCategoria || "turistico",
        ciudad: lugar.ciudad || location?.nombre || "",
        direccion: lugar.direccion || "",
        distanciaKm,
        ubicacion: {
          latitud,
          longitud,
        },
        contacto: {
          telefono: lugar.contacto?.telefono || "",
          sitioWeb: lugar.contacto?.sitioWeb || "",
          instagram,
          instagramUrl: buildInstagramUrl(instagram),
        },
        foto,
        fuente: "Comunidad Rincones",
        osmUrl: "",
        ratingAproximado,
        relevancia: scoreData.score + 2,
      };
    })
    .filter(Boolean);

  let rankedResults = [...communityResults, ...aggregatedExternal, ...externalResults, ...wikipediaExternal, ...googleExternal, ...nominatimExternal]
    .reduce((acc, item) => {
      const duplicateIndex = acc.findIndex((existing) => isLikelyDuplicatePlace(item, existing));
      if (duplicateIndex === -1) {
        acc.push(item);
        return acc;
      }

      const currentScore = getDiscoverQualityScore(item);
      const existingScore = getDiscoverQualityScore(acc[duplicateIndex]);
      if (currentScore > existingScore) {
        acc[duplicateIndex] = item;
      }

      return acc;
    }, [])
    .filter((item) => {
      if (!hasQuery) {
        return true;
      }

      const minScore = item.fuente === "Comunidad Rincones" ? 4 : 7;
      return item.relevancia >= minScore;
    })
    .filter((item) => {
      if (!strictIntent) {
        return true;
      }

      const normalizedItemCategory = normalizeCategoria(item.categoria);
      if (wantedCategories.has(normalizedItemCategory)) {
        return true;
      }

      // Keep only very strong lexical matches as exceptions.
      return Number(item.relevancia || 0) >= 20 && hasDirectQueryMatch({ query, item });
    })
    .sort((a, b) => {
      const relevanceDelta = Number(b.relevancia || 0) - Number(a.relevancia || 0);

      // If both places are similarly relevant, prioritize community content for product identity.
      if (Math.abs(relevanceDelta) <= 2) {
        const aCommunity = isCommunitySource(a);
        const bCommunity = isCommunitySource(b);
        if (aCommunity !== bCommunity) {
          return bCommunity ? 1 : -1;
        }
      }

      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }

      const aDistance = Number.isFinite(a.distanciaKm) ? a.distanciaKm : 999;
      const bDistance = Number.isFinite(b.distanciaKm) ? b.distanciaKm : 999;
      return aDistance - bDistance;
    });

  if (!enableWikipedia && rankedResults.length < Math.ceil(safeLimit * 0.5)) {
    const supplementalWikipedia = await fetchWikipediaPlaces({
      query,
      centerLat,
      centerLng,
      radiusKm: safeRadiusKm,
      limit: safeLimit,
      zona: location?.nombre || zona,
    });

    if (supplementalWikipedia.length) {
      rankedResults = [...rankedResults, ...supplementalWikipedia]
        .reduce((acc, item) => {
          const duplicateIndex = acc.findIndex((existing) => isLikelyDuplicatePlace(item, existing));
          if (duplicateIndex === -1) {
            acc.push(item);
            return acc;
          }

          const currentScore = getDiscoverQualityScore(item);
          const existingScore = getDiscoverQualityScore(acc[duplicateIndex]);
          if (currentScore > existingScore) {
            acc[duplicateIndex] = item;
          }

          return acc;
        }, [])
        .sort((a, b) => Number(b.relevancia || 0) - Number(a.relevancia || 0));
    }
  }

  const aiPass = await rerankWithAIIfEnabled({
    query,
    locationName: location?.nombre || zona,
    results: rankedResults,
  });

  const results = aiPass.results.slice(0, safeLimit);
  const sourceSet = [...new Set(results.map((item) => String(item.fuente || "").trim()).filter(Boolean))];
  const sourceBreakdown = results.reduce((acc, item) => {
    const source = String(item.fuente || "desconocida");
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});

  if (results.length === 0) {
    const expandedRadiusMeters = Math.round(Math.max(safeRadiusKm, hasCoords ? 20 : 45) * 1000);
    const fallbackElements = await fetchOverpassElements({
      centerLat,
      centerLng,
      radiusMeters: expandedRadiusMeters,
      selectors,
      limit: safeLimit,
    });

    const fallbackExternal = toExternalResults(fallbackElements)
      .filter((item) => {
        if (!strictIntent) {
          return true;
        }

        return wantedCategories.has(normalizeCategoria(item.categoria));
      })
      .filter((item) => item.relevancia >= (hasQuery ? 3 : 0));

    const fallbackNominatim = fallbackExternal.length
      ? []
      : await fetchNominatimPlaces({
        query,
        zona: location?.nombre || zona,
        categoria: normalizedCategoria,
        centerLat,
        centerLng,
        radiusKm: Math.max(safeRadiusKm, hasCoords ? 20 : 45),
        limit: safeLimit,
      });

    const fallbackWikipedia = enableWikipedia
      ? await fetchWikipediaPlaces({
        query,
        centerLat,
        centerLng,
        radiusKm: Math.max(safeRadiusKm, hasCoords ? 20 : 45),
        limit: safeLimit,
        zona: location?.nombre || zona,
      })
      : [];

    const fallbackGoogle = await fetchGooglePlaces({
      query,
      zona: location?.nombre || zona,
      categoria: normalizedCategoria,
      centerLat,
      centerLng,
      radiusKm: Math.max(safeRadiusKm, hasCoords ? 20 : 45),
      limit: safeLimit,
    });

    const emergencyCommunityResults = communityDocs
      .map((lugar) => {
        const itemCategoria = normalizeCategoria(lugar.categoria) || "turistico";
        const latitud = Number(lugar.ubicacion?.latitud);
        const longitud = Number(lugar.ubicacion?.longitud);

        if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
          return null;
        }

        const distanciaKm = Number(distanceInKm(centerLat, centerLng, latitud, longitud).toFixed(1));
        const foto = getPrimaryImage(lugar.imagenes);
        const instagram = lugar.contacto?.instagram || "";
        const scoreData = scorePlace({
          query,
          wantedCategories,
          itemCategoria,
          strictIntent,
          tags: {
            amenity: itemCategoria,
            tourism: itemCategoria,
            description: lugar.descripcion || "",
            website: lugar.contacto?.sitioWeb || "",
            phone: lugar.contacto?.telefono || "",
          },
          nombre: lugar.nombre,
          direccion: lugar.direccion,
          foto,
          instagram,
          distanceKm: distanciaKm,
        });

        return {
          id: `emergency-local-${String(lugar._id)}`,
          nombre: lugar.nombre,
          categoria: itemCategoria,
          ciudad: lugar.ciudad || location?.nombre || "",
          direccion: lugar.direccion || "",
          distanciaKm,
          ubicacion: {
            latitud,
            longitud,
          },
          contacto: {
            telefono: lugar.contacto?.telefono || "",
            sitioWeb: lugar.contacto?.sitioWeb || "",
            instagram,
            instagramUrl: buildInstagramUrl(instagram),
          },
          foto,
          fuente: "Comunidad Rincones",
          osmUrl: "",
          ratingAproximado: scoreData.ratingAproximado,
          relevancia: scoreData.score + 1,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.relevancia || 0) - Number(a.relevancia || 0))
      .slice(0, safeLimit);

    const fallbackRanked = [...communityResults, ...aggregatedExternal, ...fallbackExternal, ...fallbackNominatim, ...fallbackWikipedia, ...fallbackGoogle, ...emergencyCommunityResults]
      .reduce((acc, item) => {
        const duplicateIndex = acc.findIndex((existing) => isLikelyDuplicatePlace(item, existing));
        if (duplicateIndex === -1) {
          acc.push(item);
          return acc;
        }

        const currentScore = getDiscoverQualityScore(item);
        const existingScore = getDiscoverQualityScore(acc[duplicateIndex]);
        if (currentScore > existingScore) {
          acc[duplicateIndex] = item;
        }

        return acc;
      }, [])
      .sort((a, b) => {
        if (b.relevancia !== a.relevancia) {
          return b.relevancia - a.relevancia;
        }

        const aDistance = Number.isFinite(a.distanciaKm) ? a.distanciaKm : 999;
        const bDistance = Number.isFinite(b.distanciaKm) ? b.distanciaKm : 999;
        return aDistance - bDistance;
      });

    const fallbackAiPass = await rerankWithAIIfEnabled({
      query,
      locationName: location?.nombre || zona,
      results: fallbackRanked,
    });
    const fallbackResults = fallbackAiPass.results.slice(0, safeLimit);
    const fallbackSources = [...new Set(fallbackResults.map((item) => String(item.fuente || "").trim()).filter(Boolean))];
    const fallbackSourceBreakdown = fallbackResults.reduce((acc, item) => {
      const source = String(item.fuente || "desconocida");
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    const payload = {
      location,
      results: fallbackResults,
      meta: {
        sourcesUsed: fallbackSources,
        sourceBreakdown: fallbackSourceBreakdown,
        aiReranked: fallbackAiPass.aiReranked,
        aiProvider: fallbackAiPass.aiProvider,
        fallbackUsed: true,
        sourcesTried: [
          "Comunidad Rincones",
          "OpenStreetMap",
          "OpenStreetMap Nominatim",
          "Wikipedia",
          "Google Places",
          "Foursquare",
        ],
      },
    };

    discoverCache.set(cacheKey, {
      createdAt: Date.now(),
      payload,
    });

    return payload;
  }

  const payload = {
    location,
    results,
    meta: {
      sourcesUsed: sourceSet,
      sourceBreakdown,
      aiReranked: aiPass.aiReranked,
      aiProvider: aiPass.aiProvider,
      fallbackUsed: false,
      sourcesTried: [
        "Comunidad Rincones",
        "OpenStreetMap",
        "OpenStreetMap Nominatim",
        "Wikipedia",
        "Google Places",
        "Foursquare",
      ],
    },
  };

  discoverCache.set(cacheKey, {
    createdAt: Date.now(),
    payload,
  });

  return payload;
};

module.exports = {
  searchLocation,
  reverseLocation,
  discoverPlaces,
};
