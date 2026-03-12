const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const tokenize = (value = "") =>
  normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);

const INTENT_RULES = {
  rio: ["rio", "río", "costanera", "balneario", "laguna", "playa", "pesca", "mate"],
  bar: ["bar", "birra", "cerveza", "pub", "coctel", "cocktail", "trago"],
  restaurante: ["restaurante", "comida", "almuerzo", "cena", "parrilla", "pizzeria", "pizza", "hamburguesa"],
  cafeteria: ["cafeteria", "cafetería", "cafe", "café", "desayuno", "merienda", "coffee"],
  montana: ["montana", "montaña", "cerro", "trekking", "sendero"],
  mirador: ["mirador", "vista", "panoramica", "panorámica"],
  turistico: ["turistico", "turístico", "paseo", "atraccion", "atracción", "visita"],
};

const getBaseText = (lugar) =>
  normalize([
    lugar.nombre,
    lugar.descripcion,
    lugar.ciudad,
    lugar.direccion,
    lugar.categoria,
  ].join(" "));

const computeIntentScores = (query) => {
  const tokens = tokenize(query);
  const scores = Object.keys(INTENT_RULES).reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  tokens.forEach((token) => {
    Object.entries(INTENT_RULES).forEach(([categoria, synonyms]) => {
      const hasMatch = synonyms.some((word) => normalize(word).includes(token) || token.includes(normalize(word)));
      if (hasMatch) {
        scores[categoria] += 1;
      }
    });
  });

  return scores;
};

export const getSuggestedCategories = (query, limit = 3) => {
  if (!normalize(query)) {
    return [];
  }

  const scored = Object.entries(computeIntentScores(query))
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  return scored.slice(0, limit).map(([categoria]) => categoria);
};

export const rankLugaresBySmartQuery = (lugares, query) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return lugares;
  }

  const tokens = tokenize(normalizedQuery);
  const intentScores = computeIntentScores(normalizedQuery);

  const ranked = lugares
    .map((lugar) => {
      const baseText = getBaseText(lugar);
      const nombre = normalize(lugar.nombre);
      const descripcion = normalize(lugar.descripcion);
      const ciudad = normalize(lugar.ciudad);
      const categoria = normalize(lugar.categoria);

      let score = 0;

      tokens.forEach((token) => {
        if (nombre.includes(token)) {
          score += 6;
        }
        if (ciudad.includes(token)) {
          score += 4;
        }
        if (categoria.includes(token)) {
          score += 5;
        }
        if (descripcion.includes(token)) {
          score += 2;
        }
        if (baseText.includes(token)) {
          score += 1;
        }
      });

      if (intentScores[categoria]) {
        score += intentScores[categoria] * 5;
      }

      return {
        ...lugar,
        _smartScore: score,
      };
    })
    .filter((lugar) => lugar._smartScore > 0)
    .sort((a, b) => b._smartScore - a._smartScore);

  return ranked;
};
