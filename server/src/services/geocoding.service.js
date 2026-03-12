const Lugar = require("../models/lugar.model");

const searchLocation = async (query) => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(`${query}, Argentina`)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "rincones-app/1.0 (geocoding-service)",
    },
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
    .map((item) => ({
      latitud: Number(item.lat),
      longitud: Number(item.lon),
      nombre: item.display_name,
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

const fetchOverpassElements = async ({ centerLat, centerLng, radiusMeters, selectors, limit }) => {
  const selectorQuery = selectors
    .map(
      (selector) =>
        `node(around:${radiusMeters},${centerLat},${centerLng})${selector};\n  way(around:${radiusMeters},${centerLat},${centerLng})${selector};\n  relation(around:${radiusMeters},${centerLat},${centerLng})${selector};`
    )
    .join("\n  ");

  const overpassQuery = `[out:json][timeout:20];\n(\n  ${selectorQuery}\n);\nout center ${limit};`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": "rincones-app/1.0 (discover-service)",
    },
    body: overpassQuery,
  });

  if (!response.ok) {
    const error = new Error("No se pudo consultar lugares externos");
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data.elements) ? data.elements : [];
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

const scorePlace = ({ query, wantedCategories, itemCategoria, tags, nombre, direccion, foto, instagram, distanceKm }) => {
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
      score += 14;
    } else {
      score -= 14;
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

const discoverPlaces = async ({ query, zona = "", categoria = "all", limit = 20, lat, lng, radiusKm }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 6), 24);
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const requestedRadiusKm = Number(radiusKm);
  const safeRadiusKm = Number.isFinite(requestedRadiusKm)
    ? Math.min(Math.max(requestedRadiusKm, 2), 60)
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
    location = await reverseLocation({ lat: centerLat, lng: centerLng });
  } else {
    const locationResult = await searchLocation(zona || query);

    if (!locationResult?.data) {
      return {
        location: null,
        results: [],
      };
    }

    centerLat = Number(locationResult.data.latitud);
    centerLng = Number(locationResult.data.longitud);
    location = locationResult.data;
  }

  const normalizedCategoria = normalizeCategoria(categoria);
  const hasQuery = normalizeText(query).length > 0;
  const wantedCategories = inferWantedCategories(query, categoria);
  const strictIntent = wantedCategories.size > 0;
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

  const initialElements = await fetchOverpassElements({
    centerLat,
    centerLng,
    radiusMeters: aroundRadiusMeters,
    selectors,
    limit: safeLimit,
  });

  const externalResults = toExternalResults(initialElements);

  const normalizedZona = normalizeText(zona);
  const communityMaxDistanceKm = Math.max(safeRadiusKm * 1.5, hasCoords ? 10 : 18);

  const communityDocs = await Lugar.find({}, { __v: 0 }).sort({ creadoEn: -1 }).limit(500).lean();

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

  const results = [...communityResults, ...externalResults]
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

      return wantedCategories.has(normalizeCategoria(item.categoria));
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
    })
    .slice(0, safeLimit);

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

    const fallbackResults = [...communityResults, ...fallbackExternal]
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
      })
      .slice(0, safeLimit);

    const payload = {
      location,
      results: fallbackResults,
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
