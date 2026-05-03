const PlaceCache = require("../models/placeCache.model");
const Lugar = require("../models/lugar.model");

const FOURSQUARE_API_URL = "https://api.foursquare.com/v3/places/search";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const PLACES_FETCH_TIMEOUT_MS = Number(process.env.PLACES_FETCH_TIMEOUT_MS || 5500);
const GOOGLE_PLACES_ENABLED = String(process.env.GOOGLE_PLACES_ENABLED || "false").trim().toLowerCase() === "true";
const GOOGLE_PLACES_API_KEY = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
const GOOGLE_PLACES_TIMEOUT_MS = Number(process.env.GOOGLE_PLACES_TIMEOUT_MS || 7000);

const CATEGORY_TO_FSQ = {
  vinoteca: "17069,13032",
  winebar: "13003,13065",
  degustacion: "10000,13065",
  bodega: "10000",
  feria_vino: "10000",
  cafe: "13032",
  cafeteria: "13032",
  restaurant: "13065",
  restaurante: "13065",
  bar: "13003,13065",
  viewpoint: "16020",
  mirador: "16020",
  nature: "16000,16032",
  rio: "16032",
  river: "16032",
  touristico: "10000",
  attraction: "10000",
};

const CATEGORY_ALIASES = {
  all: "all",
  vinoteca: "vinoteca",
  vinotecas: "vinoteca",
  winebar: "winebar",
  "wine-bar": "winebar",
  winebars: "winebar",
  "bar de vinos": "winebar",
  degustacion: "degustacion",
  degustaciones: "degustacion",
  cata: "degustacion",
  tasting: "degustacion",
  bodega: "bodega",
  bodegas: "bodega",
  vinedo: "bodega",
  vinedos: "bodega",
  vineria: "vinoteca",
  feria_vino: "feria_vino",
  "feria-vino": "feria_vino",
  feria: "feria_vino",
  cafe: "cafeteria",
  cafes: "cafeteria",
  coffee: "cafeteria",
  coffees: "cafeteria",
  cafeteria: "cafeteria",
  cafeterias: "cafeteria",
  restaurant: "restaurante",
  restaurants: "restaurante",
  restaurante: "restaurante",
  restaurantes: "restaurante",
  bar: "bar",
  bars: "bar",
  pub: "bar",
  pubs: "bar",
  viewpoint: "mirador",
  viewpoints: "mirador",
  mirador: "mirador",
  miradores: "mirador",
  nature: "rio",
  river: "rio",
  rivers: "rio",
  rio: "rio",
  rios: "rio",
  montana: "montana",
  montanas: "montana",
  mountain: "montana",
  mountains: "montana",
  turistico: "turistico",
  turismo: "turistico",
  attraction: "turistico",
  attractions: "turistico",
};

const normalizeText = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeCategory = (value = "") => {
  const normalized = normalizeText(value) || "all";
  return CATEGORY_ALIASES[normalized] || normalized;
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const distanceInMeters = (lat1, lng1, lat2, lng2) => {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const mapFoursquareCategory = (categories = []) => {
  const primary = categories[0]?.name || "";
  const value = normalizeText(primary);

  if (value.includes("wine shop") || value.includes("liquor")) return "vinoteca";
  if (value.includes("wine bar")) return "winebar";
  if (value.includes("winery") || value.includes("vineyard")) return "bodega";
  if (value.includes("tasting")) return "degustacion";
  if (value.includes("cafe") || value.includes("coffee")) return "cafeteria";
  if (value.includes("restaurant") || value.includes("food")) return "restaurante";
  if (value.includes("bar") || value.includes("pub") || value.includes("beer")) return "bar";
  if (value.includes("viewpoint") || value.includes("scenic")) return "mirador";
  if (value.includes("park") || value.includes("nature") || value.includes("river")) return "rio";
  return "turistico";
};

const buildAddress = (location = {}) => {
  const parts = [
    location.address,
    location.locality,
    location.region,
    location.country,
  ].filter(Boolean);

  return parts.join(", ");
};

const getOverpassSelectors = (category) => {
  const normalized = normalizeCategory(category);

  switch (normalized) {
    case "vinoteca":
      return ['["shop"~"wine|alcohol"]'];
    case "winebar":
      return ['["amenity"="bar"]', '["amenity"="pub"]'];
    case "degustacion":
      return ['["tourism"="attraction"]', '["amenity"="restaurant"]'];
    case "bodega":
      return ['["craft"="winery"]', '["tourism"="attraction"]'];
    case "feria_vino":
      return ['["amenity"="marketplace"]', '["tourism"="attraction"]'];
    case "cafeteria":
      return ['["amenity"="cafe"]'];
    case "restaurante":
      return ['["amenity"="restaurant"]', '["amenity"="fast_food"]'];
    case "bar":
      return ['["amenity"="bar"]', '["amenity"="pub"]'];
    case "mirador":
      return ['["tourism"="viewpoint"]'];
    case "rio":
      return ['["natural"="water"]', '["waterway"~"river|stream"]', '["leisure"="park"]'];
    default:
      return [
        '["amenity"~"cafe|restaurant|fast_food|bar|pub"]',
        '["tourism"~"viewpoint|attraction"]',
      ];
  }
};

const inferCategoryFromTags = (tags = {}) => {
  const amenity = normalizeText(tags.amenity || "");
  const tourism = normalizeText(tags.tourism || "");
  const natural = normalizeText(tags.natural || "");
  const waterway = normalizeText(tags.waterway || "");
  const shop = normalizeText(tags.shop || "");
  const craft = normalizeText(tags.craft || "");

  if (["wine", "alcohol"].includes(shop)) return "vinoteca";
  if (craft === "winery") return "bodega";
  if (amenity === "cafe") return "cafeteria";
  if (amenity === "bar" && normalizeText(tags["drink:wine"] || "") === "yes") return "winebar";
  if (["restaurant", "fast_food"].includes(amenity)) return "restaurante";
  if (["bar", "pub"].includes(amenity)) return "bar";
  if (tourism === "viewpoint") return "mirador";
  if (["water"].includes(natural) || ["river", "stream"].includes(waterway)) return "rio";
  return "turistico";
};

const extractElementLatLng = (element = {}) => ({
  latitude: Number(element.lat ?? element.center?.lat),
  longitude: Number(element.lon ?? element.center?.lon),
});

const buildAddressFromTags = (tags = {}) => {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
  const full = [street, city].filter(Boolean).join(", ");
  return full || String(tags["addr:full"] || "").trim();
};

const fetchPlacesFromOpenStreetMap = async ({ lat, lng, radius, category }) => {
  const safeRadius = Math.min(Math.max(Number(radius) || 2500, 200), 30000);
  const selectors = getOverpassSelectors(category);
  const selectorQuery = selectors
    .map(
      (selector) =>
        `node(around:${safeRadius},${Number(lat)},${Number(lng)})${selector};\n  way(around:${safeRadius},${Number(lat)},${Number(lng)})${selector};\n  relation(around:${safeRadius},${Number(lat)},${Number(lng)})${selector};`
    )
    .join("\n  ");

  const overpassQuery = `[out:json][timeout:20];\n(\n  ${selectorQuery}\n);\nout center 80;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "User-Agent": "rincones-app/1.0 (places-map-osm)",
        },
        body: overpassQuery,
        signal: AbortSignal.timeout(PLACES_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      const places = elements
        .map((element) => {
          const tags = element.tags || {};
          const name = String(tags.name || "").trim();
          const coords = extractElementLatLng(element);

          if (!name || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
            return null;
          }

          const mappedCategory = inferCategoryFromTags(tags);
          const distance = Math.round(distanceInMeters(Number(lat), Number(lng), coords.latitude, coords.longitude));

          return {
            id: `osm-${element.type}-${element.id}`,
            name,
            category: mappedCategory,
            latitude: coords.latitude,
            longitude: coords.longitude,
            address: buildAddressFromTags(tags),
            rating: null,
            distance,
            source: "openstreetmap",
            rawCategory: String(tags.amenity || tags.tourism || tags.natural || tags.waterway || ""),
          };
        })
        .filter((place) => place && categoryMatches(place.category, category))
        .sort((a, b) => (Number(a.distance) || Number.MAX_SAFE_INTEGER) - (Number(b.distance) || Number.MAX_SAFE_INTEGER))
        .slice(0, 40);

      if (places.length) {
        return places;
      }
    } catch {
      // Try next endpoint.
    }
  }

  return [];
};

const normalizePlace = (item = {}) => ({
  id: String(item.fsq_id || item.id || ""),
  name: String(item.name || "").trim(),
  category: mapFoursquareCategory(item.categories),
  latitude: Number(item.geocodes?.main?.latitude),
  longitude: Number(item.geocodes?.main?.longitude),
  address: buildAddress(item.location),
  rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
  distance: Number.isFinite(Number(item.distance)) ? Number(item.distance) : null,
  source: "foursquare",
  rawCategory: String(item.categories?.[0]?.name || "").trim(),
});

const buildCacheKey = ({ lat, lng, radius, category }) => {
  const precision = radius <= 1500 ? 3 : radius <= 5000 ? 2 : 1;
  return [
    Number(lat).toFixed(precision),
    Number(lng).toFixed(precision),
    Math.round(radius),
    normalizeCategory(category),
  ].join(":");
};

const getCategoryParam = (category) => CATEGORY_TO_FSQ[normalizeCategory(category)] || "";

const categoryMatches = (placeCategory, requestedCategory) => {
  const normalizedRequested = normalizeCategory(requestedCategory);
  if (!normalizedRequested || normalizedRequested === "all") {
    return true;
  }

  return normalizeCategory(placeCategory) === normalizedRequested;
};

const getCachedPlaces = async ({ lat, lng, radius, category }) => {
  const key = buildCacheKey({ lat, lng, radius, category });
  const cached = await PlaceCache.findOne({ key }).lean();
  if (!cached) {
    return null;
  }

  return Array.isArray(cached.places) ? cached.places : [];
};

const cachePlaces = async ({ lat, lng, radius, category, places }) => {
  const ttlMinutes = Number(process.env.PLACES_CACHE_TTL_MINUTES || 60);
  const key = buildCacheKey({ lat, lng, radius, category });
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await PlaceCache.findOneAndUpdate(
    { key },
    {
      key,
      latitude: Number(lat),
      longitude: Number(lng),
      radius: Number(radius),
      category: normalizeCategory(category),
      places,
      source: "foursquare",
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const fetchPlacesFromFoursquare = async ({ lat, lng, radius, category }) => {
  const apiKey = String(process.env.FOURSQUARE_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    ll: `${Number(lat)},${Number(lng)}`,
    radius: String(Math.min(Math.max(Number(radius) || 2000, 200), 100000)),
    limit: "50",
    sort: "DISTANCE",
    fields: "fsq_id,name,categories,geocodes,location,rating,distance",
  });

  const fsqCategories = getCategoryParam(category);
  if (fsqCategories) {
    params.set("categories", fsqCategories);
  }

  const response = await fetch(`${FOURSQUARE_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: apiKey,
    },
    signal: AbortSignal.timeout(PLACES_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Foursquare request failed: ${response.status} ${text}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  return Array.isArray(payload.results)
    ? payload.results.map(normalizePlace).filter((place) => place.id && place.name)
    : [];
};

const categoriaToGoogleType = (category = "") => {
  const normalized = normalizeCategory(category);

  switch (normalized) {
    case "vinoteca":
      return "liquor_store";
    case "winebar":
      return "bar";
    case "degustacion":
      return "restaurant";
    case "bodega":
      return "tourist_attraction";
    case "feria_vino":
      return "tourist_attraction";
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

const inferCategoryFromGoogleTypes = (types = []) => {
  const normalized = Array.isArray(types) ? types.map((item) => normalizeText(item)) : [];

  if (normalized.includes("liquor_store")) return "vinoteca";
  if (normalized.includes("cafe")) return "cafeteria";
  if (normalized.includes("restaurant") || normalized.includes("meal_takeaway")) return "restaurante";
  if (normalized.includes("bar") || normalized.includes("night_club")) return "bar";
  if (normalized.includes("tourist_attraction") || normalized.includes("museum")) return "mirador";
  if (normalized.includes("park") || normalized.includes("natural_feature")) return "rio";
  return "turistico";
};

const fetchPlacesFromGoogle = async ({ lat, lng, radius, category }) => {
  if (!GOOGLE_PLACES_ENABLED || !GOOGLE_PLACES_API_KEY) {
    return [];
  }

  const safeRadius = Math.min(Math.max(Number(radius) || 2500, 200), 50000);
  const params = new URLSearchParams({
    location: `${Number(lat)},${Number(lng)}`,
    radius: String(safeRadius),
    language: "es",
    key: GOOGLE_PLACES_API_KEY,
  });

  const type = categoriaToGoogleType(category);
  if (type) {
    params.set("type", type);
  }

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`, {
      headers: {
        "User-Agent": "rincones-app/1.0 (places-google)",
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

    return payload.results
      .map((item) => {
        const latitude = Number(item.geometry?.location?.lat);
        const longitude = Number(item.geometry?.location?.lng);
        const name = String(item.name || "").trim();

        if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          id: `google-${String(item.place_id || `${latitude}-${longitude}`)}`,
          name,
          category: inferCategoryFromGoogleTypes(item.types),
          latitude,
          longitude,
          address: String(item.vicinity || "").trim(),
          rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
          distance: Math.round(distanceInMeters(Number(lat), Number(lng), latitude, longitude)),
          source: "google-places",
          rawCategory: Array.isArray(item.types) ? item.types.join(",") : "",
        };
      })
      .filter((place) => place && categoryMatches(place.category, category))
      .sort((a, b) => (Number(a.distance) || Number.MAX_SAFE_INTEGER) - (Number(b.distance) || Number.MAX_SAFE_INTEGER))
      .slice(0, 50);
  } catch {
    return [];
  }
};

const fetchPlacesFromCommunity = async ({ lat, lng, radius, category, strictRadius = true }) => {
  const safeRadius = Math.min(Math.max(Number(radius) || 2500, 200), 100000);
  const docs = await Lugar.find({}, { __v: 0 }).sort({ creadoEn: -1 }).limit(800).lean();

  return docs
    .map((item) => {
      const latitude = Number(item.ubicacion?.latitud);
      const longitude = Number(item.ubicacion?.longitud);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      const distance = Math.round(distanceInMeters(Number(lat), Number(lng), latitude, longitude));
      if (strictRadius && distance > safeRadius) {
        return null;
      }

      if (!categoryMatches(item.categoria, category)) {
        return null;
      }

      return {
        id: `local-${String(item._id)}`,
        name: String(item.nombre || "").trim(),
        category: normalizeCategory(item.categoria) || "turistico",
        latitude,
        longitude,
        address: [item.direccion, item.ciudad].filter(Boolean).join(", "),
        rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
        distance,
        source: "community",
        rawCategory: String(item.categoria || ""),
      };
    })
    .filter((place) => place && place.id && place.name)
    .sort((a, b) => {
      const aDistance = Number.isFinite(a.distance) ? a.distance : Number.MAX_SAFE_INTEGER;
      const bDistance = Number.isFinite(b.distance) ? b.distance : Number.MAX_SAFE_INTEGER;
      return aDistance - bDistance;
    })
    .slice(0, 50);
};

const getNearbyPlaces = async ({ lat, lng, radius, category }) => {
  const normalizedRequestedCategory = normalizeCategory(category);
  const cachedPlaces = await getCachedPlaces({ lat, lng, radius, category });
  if (cachedPlaces !== null && cachedPlaces.length > 0) {
    if (normalizedRequestedCategory !== "all" && cachedPlaces.length > 0) {
      const categoryMatchedCached = cachedPlaces.filter((item) => categoryMatches(item.category, normalizedRequestedCategory));
      if (categoryMatchedCached.length > 0) {
        return {
          source: "cache",
          places: categoryMatchedCached,
        };
      }
      // Ignore stale cache that doesn't match requested category and refresh from providers.
    } else {
      return {
        source: "cache",
        places: cachedPlaces,
      };
    }
  }

  const foursquarePlaces = await fetchPlacesFromFoursquare({ lat, lng, radius, category });
  if (Array.isArray(foursquarePlaces)) {
    await cachePlaces({ lat, lng, radius, category, places: foursquarePlaces });

    return {
      source: "foursquare",
      places: foursquarePlaces,
    };
  }

  const googlePlaces = await fetchPlacesFromGoogle({ lat, lng, radius, category });
  if (googlePlaces.length) {
    await cachePlaces({ lat, lng, radius, category, places: googlePlaces });
    return {
      source: "google-places",
      places: googlePlaces,
    };
  }

  const fallbackPlaces = await fetchPlacesFromCommunity({
    lat,
    lng,
    radius,
    category,
    strictRadius: true,
  });

  if (fallbackPlaces.length) {
    await cachePlaces({ lat, lng, radius, category, places: fallbackPlaces });

    return {
      source: "community-fallback",
      places: fallbackPlaces,
    };
  }

  const nearestCommunityPlaces = await fetchPlacesFromCommunity({
    lat,
    lng,
    radius,
    category,
    strictRadius: false,
  });

  let nearestLimited = nearestCommunityPlaces.slice(0, 20);
  let fallbackSource = "community-fallback-nearest";

  // Prefer category-specific OSM data before broad any-category fallback.
  if (!nearestLimited.length) {
    const osmPlaces = await fetchPlacesFromOpenStreetMap({ lat, lng, radius, category });
    if (osmPlaces.length) {
      await cachePlaces({ lat, lng, radius, category, places: osmPlaces });
      return {
        source: "osm-fallback",
        places: osmPlaces,
      };
    }
  }

  if (!nearestLimited.length && normalizedRequestedCategory !== "all") {
    const nearestAnyCategory = await fetchPlacesFromCommunity({
      lat,
      lng,
      radius,
      category: "all",
      strictRadius: false,
    });
    nearestLimited = nearestAnyCategory.slice(0, 20);
    if (nearestLimited.length) {
      fallbackSource = "community-fallback-nearest-any";
    }
  }

  if (fallbackSource !== "community-fallback-nearest-any") {
    await cachePlaces({ lat, lng, radius, category, places: nearestLimited });
  }

  return {
    source: fallbackSource,
    places: nearestLimited,
  };
};

module.exports = {
  getNearbyPlaces,
};