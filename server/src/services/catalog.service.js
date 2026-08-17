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
const {
  identityKey,
  composeSearchName,
  composeDisplayName,
  canonicalGrape,
} = require("../data/wineIdentity");
// Se requiere el MÓDULO y no sus funciones sueltas: las llamadas al modelo son
// justo lo que hay que poder interceptar en un test sin salir a la red.
const wineAi = require("./wineAi.service");
const communityWines = require("./communityWines.service");
// El criterio para decidir qué botella es una lectura. Módulo puro y aparte: es
// la pieza más delicada del escaneo y tiene que poder probarse sin base ni red.
const matching = require("../data/wineMatching");
const CatalogSearch = require("../models/catalogSearch.model");
const WineVerification = require("../models/wineVerification.model");
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
    results = await wineAi.searchWinesWithAi(query);
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

// Orden de confianza. El catálogo va primero por dos razones que se suman:
// una parte está verificada contra los sitios oficiales de las bodegas (ver
// argentineWines.js, donde cada bloque dice si pasó por eso y contra qué), y
// todo él es estable y auditable — siempre devuelve lo mismo, se puede leer
// entero, corregir y revisar en el historial. Después lo que cargó gente real,
// después el modelo (que puede alucinar y cambia entre llamadas), y al final
// OFF, que en Argentina trae datos sucios.
//
// ── LO COMUNITARIO SE PARTIÓ EN DOS ─────────────────────────────────────────
// Estaba todo junto en el puesto 1, arriba del modelo. Eso valía para un vino
// que dos personas cargaron igual; no valía para uno que cargó una sola persona
// desde una foto que quizá se leyó mal. Como el ranking no los distinguía, el
// segundo caso heredaba la autoridad del primero y se mostraba por encima de
// Gemini, que al menos sabe cuándo no sabe.
//
// Ahora una fila comunitaria sube al puesto 1 recién cuando la confirmó una
// segunda persona de forma independiente; hasta entonces va DEBAJO del modelo.
// Sigue apareciendo —es un vino real que alguien tiene en su casa— pero no
// desplaza a una fuente que no depende de una sola lectura.
const SOURCE_RANK = {
  "catalogo-ar": 0,
  "comunidad-verificada": 1,
  gemini: 2,
  comunidad: 3,
  openfoodfacts: 4,
};

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
      const s = summaries.get(wineReviews.wineKey(w.name, w.winery, w.varietal));
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
/**
 * Sólo lo que sabemos sin salir a preguntar: catálogo curado + comunitario.
 *
 * Los dos son instantáneos (uno es un array en memoria, el otro una consulta
 * indexada) y los dos son datos que ya verificamos o que cargó una persona. Se
 * separó en su propia función porque hay un caso —enriquecer un escaneo— donde
 * NO hay que consultar nada más, y mezclarlo con el resto salía caro. Ver
 * `findMatch`.
 */
const buscarLocal = async (q) =>
  Promise.all([
    Promise.resolve(searchCatalog(q)),
    communityWines.search(q).catch(() => []),
  ]);

const searchWines = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return { results: [], degraded: false };

  // Catálogo curado (sync) + comunitario (DB) en paralelo: ambos rápidos.
  const [local, community] = await buscarLocal(q);

  // Si entre lo curado y lo comunitario ya hay suficiente, cortamos acá y no
  // gastamos cuota de IA ni esperamos a fuentes externas.
  if (local.length + community.length >= AI_THRESHOLD) {
    return { results: await withReviews(dedupeAndRank([local, community])), degraded: false };
  }

  const [aiResults, offResult] = await Promise.all([
    wineAi.isAiSearchConfigured() ? searchWithAiCached(q) : Promise.resolve([]),
    searchOpenFoodFacts(q).catch(() => null),
  ]);

  const external = offResult || [];
  const offFailed = offResult === null;
  const results = await withReviews(dedupeAndRank([local, community, aiResults, external]));
  return { results, degraded: offFailed && results.length === 0 };
};

/**
 * El catálogo curado entero, listo para mostrar.
 *
 * Acá vivía `getFeatured`, que elegía los ocho destacados de la home barajando
 * el catálogo con una semilla derivada del día y deduplicando por bodega. Esa
 * elección se mudó a `services/recommendations.service.js`, donde puede mirar la
 * bodega y las preferencias de quien está del otro lado — que es lo que le
 * faltaba: el barajado devolvía la misma home para todo el mundo y podía
 * recomendarte un vino que ya tenías.
 *
 * Lo que queda acá es lo único que era responsabilidad del catálogo: entregar
 * las filas sin `haystack`, que es el campo interno de búsqueda y no tiene por
 * qué salir a la red.
 */
const getCatalogPool = () => CATALOG.map(({ haystack, ...wine }) => wine);

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
 *
 * ── POR QUÉ SÓLO MIRA LO LOCAL ──────────────────────────────────────────────
 * Antes llamaba a `searchWines`, o sea la cadena entera: catálogo, comunidad,
 * Gemini y Open Food Facts. Y esto corre en el CAMINO CRÍTICO del escaneo —
 * entre que sacás la foto y que aparece la pantalla de revisión —, así que en el
 * peor caso la espera era: Gemini Vision leyendo la etiqueta, después OTRA
 * llamada a Gemini buscando lo que Gemini acababa de leer, y encima OFF con sus
 * 6 segundos de timeout. Tres viajes para completar unos huecos.
 *
 * Las dos fuentes remotas además no servían para esto:
 *
 *   Gemini — es circular. El modelo ya leyó la etiqueta; volver a preguntarle no
 *            aporta un dato verificado, aporta una segunda opinión del mismo
 *            que puede alucinar, y la escribimos con confianza 75 en el vino.
 *   OFF    — su `region` es EL PAÍS (`countries.split(",")[0]`, ver
 *            `normalizeOff`). Enriquecer desde ahí escribía "Argentina" en el
 *            campo región de tu vino, donde va "Luján de Cuyo, Mendoza" — y de
 *            ahí pasaba al catálogo comunitario. Y su `varietal` viene siempre
 *            vacío, así que ni siquiera aportaba la uva.
 *
 * Queda lo que de verdad puede completar huecos con algo cierto: el catálogo
 * curado y lo que cargó gente real. Los dos son locales, así que la revisión
 * ahora aparece apenas termina de leerse la etiqueta.
 */
// Cómo se busca una lectura de etiqueta: con la uva adentro, porque "Saint
// Felicien" a secas trae las cuatro uvas de la línea y el match tendría que
// desempatar a ciegas.
//
// Va la uva CANÓNICA y no la leída, por lo mismo que el veto de `mejorCandidato`:
// buscar "Pispi Blend de tintas" exige que todos esos términos estén en el
// índice, y el catálogo curado dice "Blend" — así que la fila correcta ni
// siquiera entraba a la lista de candidatos.
const consultaDeLectura = ({ winery, line, name, varietal } = {}) =>
  String(
    composeSearchName({ name, line, varietal: canonicalGrape(varietal || ""), winery }) ||
      name ||
      ""
  ).trim();

/**
 * De una lista de candidatos, el que de verdad es esta botella — o ninguno.
 *
 * Está separado del `findMatch` de abajo porque la misma decisión se toma dos
 * veces sobre listas distintas: para ENRIQUECER una lectura (candidatos locales)
 * y para VERIFICAR el nombre (donde la lista puede venir del modelo). Que el
 * criterio sea uno solo es lo que evita que un vino se dé por bueno en un camino
 * y por dudoso en el otro.
 *
 * La uva se compara en su forma canónica, no como la leyó el modelo.
 *
 * Es el caso Pispi otra vez, por otra puerta. La etiqueta se leyó como "Blend
 * de tintas", que es correcto, y el catálogo curado lo tiene como "Blend": el
 * veto los veía distintos y DESCARTABA la fila curada. El match caía entonces en
 * la fila comunitaria, que existe pero tiene datos peores —región "Mendoza
 * Argentina" en vez de "Valle de Uco, Mendoza"—, y esa región se escribía en el
 * vino del usuario con confianza 75.
 *
 * O sea que una lectura MÁS detallada de la etiqueta daba un resultado PEOR.
 */
/**
 * De una lista de candidatos, el que de verdad es esta botella — o ninguno.
 *
 * El criterio entero (pesos, vetos, umbrales) vive en data/wineMatching.js, que
 * es un módulo puro y se prueba solo. Acá quedó el envoltorio que lo usa en los
 * dos caminos que lo necesitan: identificar y verificar.
 */
const mejorCandidato = (results, lectura = {}) => {
  const { best } = matching.identify(lectura, results || []);
  return best;
};

/**
 * ── DE DÓNDE SALEN LOS CANDIDATOS ───────────────────────────────────────────
 *
 * Acá había UNA búsqueda, armada con el nombre y la uva. La bodega no entraba —
 * `composeSearchName` sólo la usa cuando no hay nombre— y eso rompía el caso más
 * común de todos: la etiqueta se leyó bien salvo la línea. Con "Zuccardi" y
 * "Serie Q" (en vez de "Serie A") no se recuperaba NADA, teniendo la bodega
 * perfecta y catorce vinos suyos en el catálogo. El matcher no podía elegir bien
 * porque nunca veía la fila correcta.
 *
 * Ahora son tres consultas que se unen, todas locales y baratas:
 *
 *   1. la lectura completa — el caso feliz, y el más preciso;
 *   2. SÓLO la bodega — trae su catálogo entero, que es la red de seguridad para
 *      cualquier línea mal leída;
 *   3. sólo el nombre — para cuando la bodega es la que salió mal.
 *
 * Recuperar de más no afloja nada: el que decide es el scoring, que ahora mira
 * las cinco señales. Traer de menos, en cambio, es una identificación que jamás
 * puede ocurrir.
 */
const MAX_CANDIDATOS = 80;

const candidatosParaLectura = async (lectura = {}) => {
  const completa = consultaDeLectura(lectura);
  const bodega = String(lectura.winery || "").trim();
  const nucleo = matching.nucleoDe({ line: lectura.line, properName: lectura.name });

  const consultas = [...new Set([completa, bodega, nucleo].map((q) => String(q || "").trim()))]
    .filter((q) => q.length >= 3);
  if (consultas.length === 0) return [];

  const listas = await Promise.all(
    consultas.map((q) =>
      buscarLocal(q)
        .then(([curados, comunidad]) => [...curados, ...comunidad])
        .catch(() => [])
    )
  );

  // Deduplicar por identidad y no por objeto: la misma fila llega por dos
  // consultas distintas y contarla dos veces no la hace más probable.
  const porClave = new Map();
  for (const wine of listas.flat()) {
    const { core, varietal, wineryToken } = identityKey(wine);
    const clave = `${core}|${varietal}|${wineryToken}`;
    if (!porClave.has(clave)) porClave.set(clave, wine);
  }

  return [...porClave.values()].slice(0, MAX_CANDIDATOS);
};

/**
 * El texto que escribió una persona, como patrón de búsqueda.
 *
 * Escapa lo que Mongo interpretaría como regex. La misma función existe en
 * wines.service.js —doce caracteres— y NO se importa de ahí a propósito: este
 * módulo lo cargan el buscador y el escaneo, y hacerlo depender del servicio de
 * vinos (que arrastra los modelos, los lotes y el catálogo comunitario) para
 * reusar una línea sería pagar un árbol entero de requires por nada.
 *
 * Estaba faltando: se usaba sin declarar, así que en cuanto una persona con
 * sesión escaneaba una etiqueta esto tiraba ReferenceError. No se veía porque el
 * llamador lo atrapa y sigue —el escaneo funcionaba igual— pero tus propios
 * vinos nunca entraban como candidatos. Un fallo silencioso que degradaba la
 * identificación sin romper nada.
 */
const comoRegex = (valor) =>
  new RegExp(String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * Los vinos que YA tenés y se parecen a esta lectura.
 *
 * Es la señal que la app tenía y no usaba: si escaneás algo de una bodega que ya
 * está en tu cava, lo más probable es que sea un vino que ya cargaste —se repite
 * lo que gustó— y esa fila ya pasó por tus manos.
 *
 * Sólo entran los CONFIRMADOS (`verdict: "trusted"`), y ahí está toda la
 * diferencia: tus vinos dudosos son, justamente, escaneos que quizá salieron mal.
 * Usarlos para confirmar una lectura nueva sería repetir tu propio error con cara
 * de certeza — el mismo motivo por el que una fila comunitaria de una sola
 * persona no verifica nada.
 */
const misVinosParecidos = async (userId, lectura = {}) => {
  if (!userId) return [];
  const bodega = String(lectura.winery || "").trim();
  const nucleo = matching.nucleoDe({ line: lectura.line, properName: lectura.name });
  if (!bodega && !nucleo) return [];

  const condiciones = [];
  if (bodega) condiciones.push({ winery: comoRegex(bodega) });
  if (nucleo) condiciones.push({ name: comoRegex(nucleo) }, { line: comoRegex(nucleo) });

  try {
    const Wine = require("../models/wine.model");
    const mios = await Wine.find({
      userId,
      "identification.verdict": "trusted",
      $or: condiciones,
    })
      .select("name line winery region varietal type image")
      .limit(12)
      .lean();

    return mios.map((w) => ({
      id: `mio-${w._id}`,
      name: w.name || "",
      line: w.line || "",
      winery: w.winery || "",
      region: w.region || "",
      varietal: w.varietal || "",
      type: w.type || "unknown",
      image: w.image || "",
      vintage: "",
      source: "mis-vinos",
    }));
  } catch {
    // Tu bodega es una señal extra, no un requisito: si falla, se identifica
    // igual con el resto.
    return [];
  }
};

/**
 * Identifica qué vino es esta lectura, mirando todo lo que sabemos.
 *
 * Devuelve el nivel de certeza (`alta` / `media` / `ninguna`), el candidato y —si
 * la cosa estaba pareja— la alternativa, que es lo que le permite a la pantalla
 * ofrecer "¿es este o este otro?" en vez de mandar a corregir a mano.
 */
const identifyReading = async (lectura = {}, { userId } = {}) => {
  const [delCatalogo, mios] = await Promise.all([
    candidatosParaLectura(lectura),
    misVinosParecidos(userId, lectura),
  ]);
  const candidatos = [...mios, ...delCatalogo];
  // El universo viaja con el resultado para que quien siga —la verificación del
  // nombre— no tenga que volver a buscarlo. Es el camino crítico del escaneo:
  // tres consultas de más por foto no se justifican para responder sobre la
  // misma lista de vinos.
  return { ...matching.identify(lectura, candidatos), candidatos };
};

/**
 * El match que se usa para COMPLETAR datos sin preguntar.
 *
 * Exige identificación alta y no le alcanza con "probablemente sea éste": lo que
 * sale de acá se escribe en el vino de una persona sin que nadie lo confirme.
 * Con una identificación media hay algo mejor que rellenar a ciegas —mostrar el
 * candidato y preguntar—, y de eso se encarga la pantalla de revisión.
 */
const findMatch = async (lectura = {}, opciones = {}) => {
  const { level, best } = await identifyReading(lectura, opciones);
  if (!best || level !== "alta") return null;

  // La cosecha nunca se adopta del catálogo: es propia de la botella.
  return {
    ...best.wine,
    vintage: lectura.vintage || best.wine.vintage || "",
    matchScore: Number(best.score.toFixed(2)),
  };
};

// --- Verificación: ¿este vino existe, y cómo se llama exactamente? ---

/**
 * ── POR QUÉ NO ALCANZA CON LA CONFIANZA DEL MODELO ──────────────────────────
 * La visión devuelve un nombre y se puntúa a sí misma: "95, lo leí nítido". Pero
 * leer bien no es lo mismo que acertar. El modelo lee lo que está impreso más
 * grande y lo declara nombre del vino, y ahí es donde se equivoca: se come una
 * palabra de la línea, junta el nombre con la denominación, o transcribe algo
 * que no es cómo se llama la botella. Nada de eso baja la confianza, porque el
 * modelo no tiene con qué contrastarlo — está mirando una foto, no un catálogo.
 *
 * Esto es ese contraste. El nombre leído se cruza contra fuentes que existen
 * fuera de la foto, y de ahí salen tres respuestas posibles:
 *
 *   "confirmado" → una fuente real tiene este vino con este nombre.
 *   "corregido"  → lo tiene, pero se llama distinto: mandamos el nombre exacto.
 *   "sin-verificar" → nadie lo respalda. No es que esté mal; es que no lo
 *                  podemos dar por bueno solos, y quien decide es la persona
 *                  que tiene la botella en la mano.
 *
 * ── QUÉ VALE COMO FUENTE ────────────────────────────────────────────────────
 * El catálogo curado y lo comunitario YA VERIFICADO (dos personas distintas que
 * cargaron lo mismo por su cuenta), más el modelo consultado por TEXTO, que es
 * una pregunta distinta de la que se le hizo a la foto y se responde con lo que
 * sabe del mercado, no con lo que cree ver.
 *
 * Lo comunitario de una sola persona queda AFUERA a propósito, y es la parte que
 * importa: esa fila puede ser exactamente el mismo escaneo mal leído de la
 * semana pasada —incluso de la misma persona—. Confirmar una lectura con su
 * propia copia no es verificar nada, es repetirse.
 */
const FUENTES_VERIFICABLES = new Set(["catalogo-ar", "comunidad-verificada", "gemini"]);

/** El nombre exacto de una fila, sea del catálogo, de la comunidad o del modelo. */
const nombreDeFila = (wine = {}) =>
  String(wine.line || wine.properName || wine.name || "").trim();

/**
 * ── CORREGIR NO ES SUGERIR ──────────────────────────────────────────────────
 *
 * Reescribir el nombre de la botella que alguien tiene en la mano es la
 * afirmación más fuerte que hace el escaneo, y hasta acá se hacía con el mismo
 * umbral que completar una región vacía. Un candidato "probable" alcanzaba para
 * cambiarle el nombre al vino, en silencio.
 *
 * Ahora hay tres respuestas y cada una pide su nivel de certeza:
 *
 *   confirmado → la fuente dice el mismo nombre que se leyó. No cambia nada.
 *   corregido  → la fuente dice otro nombre Y la identificación es ALTA (puntaje
 *                alto, sin empate, y con el nombre coincidiendo al menos en
 *                parte). Recién ahí se reescribe.
 *   sugerido   → hay un candidato razonable pero no es para darlo por hecho. NO
 *                se toca ningún dato: se muestra y se pregunta, que es un toque
 *                para quien está mirando la etiqueta.
 */
const resolverVerificacion = (lectura, best, level = "alta") => {
  const wine = best.wine;
  const leido = composeDisplayName({ name: lectura.name, line: lectura.line });
  const oficial = nombreDeFila(wine);
  const coincide = !oficial || fold(oficial) === fold(leido);

  return {
    status: coincide ? "confirmado" : level === "alta" ? "corregido" : "sugerido",
    source: wine.source || "",
    name: oficial || leido,
    wine,
    score: Number(best.score.toFixed(2)),
    // Los campos que la fuente contradice. Sólo los devuelve el modelo, que es a
    // quien se le puede preguntar eso; el catálogo aporta filas, no opiniones.
    mismatches: [],
  };
};

const SIN_VERIFICAR = { status: "sin-verificar", source: "", name: "", wine: null, mismatches: [] };

// Qué tan seguro tiene que estar el modelo para que su respuesta cuente. Por
// debajo de esto contestó "puede ser", y "puede ser" no verifica nada.
const CONFIANZA_MINIMA_DEL_MODELO = 70;
const VERIFY_CACHE_DAYS = 30;

/**
 * La identidad LEÍDA, como clave de caché.
 *
 * No es la clave de identidad de la app (`identityKey`) a propósito: acá lo que
 * se cachea es la pregunta, y la pregunta es exactamente lo que se leyó, errores
 * incluidos. Dos lecturas distintas de la misma botella son dos preguntas
 * distintas y tienen que poder dar respuestas distintas — una puede traer el
 * nombre roto y la otra no.
 */
const claveDeVerificacion = (lectura = {}) =>
  [lectura.winery, lectura.line || lectura.name, lectura.varietal].map((v) => fold(v || "")).join("|");

/**
 * Le pregunta al modelo si este vino existe, con caché de 30 días.
 *
 * Nunca lanza. Un fallo de red NO se cachea: si se guardara como "no existe",
 * un timeout dejaría a ese vino sin verificar por un mes.
 */
const verificarConModelo = async (lectura) => {
  const key = claveDeVerificacion(lectura);

  try {
    const cached = await WineVerification.findOne({ key }).lean();
    if (cached) return cached.found ? cached.wine : null;
  } catch {
    // Sin caché seguimos: el peor caso es pagar la consulta.
  }

  let wine = null;
  try {
    wine = await wineAi.verifyWineWithAi(lectura);
  } catch {
    // La API falló. Se devuelve "no verificado" sin escribir nada.
    return null;
  }

  // Una respuesta insegura vale lo mismo que ninguna, y se cachea como ninguna:
  // volver a preguntar lo mismo va a dar lo mismo.
  const util = wine && wine.confidence >= CONFIANZA_MINIMA_DEL_MODELO ? wine : null;

  try {
    await WineVerification.updateOne(
      { key },
      {
        $set: {
          key,
          found: Boolean(util),
          wine: util,
          expiresAt: new Date(Date.now() + VERIFY_CACHE_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true }
    );
  } catch {
    // La caché es una optimización, no un requisito.
  }

  return util;
};

/**
 * Verifica una lectura de etiqueta contra una fuente real de vinos.
 *
 * Nunca lanza: si las fuentes fallan, la respuesta es "sin-verificar", que es la
 * verdad —no pudimos confirmarlo— y deja el escaneo funcionando igual.
 *
 * El escalón del modelo sólo corre cuando lo local no encontró nada, y pasa por
 * el MISMO caché de 30 días que la búsqueda por texto: un vino que ya se buscó
 * (o que ya se escaneó) se verifica sin gastar una llamada.
 */
const verifyReading = async (lectura = {}, { candidatos = null } = {}) => {
  const query = consultaDeLectura(lectura);
  // Con dos letras no hay nada que verificar: se confirmaría cualquier cosa.
  if (query.length < 3) return SIN_VERIFICAR;

  /**
   * Los candidatos pueden venir dados por quien ya los buscó.
   *
   * Identificar y verificar son dos preguntas distintas —qué botella es, y quién
   * respalda ese nombre— pero se responden sobre la MISMA lista. El escaneo las
   * hace las dos, una atrás de la otra: recibirla hecha ahorra repetir tres
   * consultas en el camino crítico, y de paso garantiza que las dos respuestas
   * hablen del mismo conjunto de vinos.
   */
  const universo = candidatos || (await candidatosParaLectura(lectura));
  const verificables = universo.filter((w) => FUENTES_VERIFICABLES.has(w.source));
  const identificado = matching.identify(lectura, verificables);
  const local = identificado.best;

  /**
   * ── CUÁNDO SE LE PREGUNTA AL MODELO ────────────────────────────────────────
   * Cuando lo local no CONFIRMÓ la identidad tal como se leyó. O sea: siempre,
   * salvo que una fuente congelada y auditable ya haya dicho "sí, este vino
   * existe y se llama exactamente así" — ahí una segunda opinión no agrega nada
   * y cuesta una llamada y un par de segundos en el peor momento posible.
   *
   * Si el catálogo CORRIGIÓ el nombre, sí se pregunta: corregir es afirmar algo
   * más fuerte que confirmar (estamos cambiando lo que dice la etiqueta que la
   * persona tiene en la mano) y conviene que dos fuentes coincidan antes.
   */
  const veredictoLocal = local ? resolverVerificacion(lectura, local, identificado.level) : null;
  if (veredictoLocal?.status === "confirmado") return veredictoLocal;

  if (wineAi.isAiSearchConfigured()) {
    const delModelo = await verificarConModelo(lectura);
    // El match se corre igual sobre la respuesta del modelo: contestó sobre ESTA
    // lectura, pero puede haber entendido otra botella —otra bodega, otra uva—, y
    // los vetos duros son los mismos para todas las fuentes.
    const porModelo = delModelo ? matching.identify(lectura, [delModelo]) : null;

    if (porModelo?.best) {
      const veredicto = resolverVerificacion(lectura, porModelo.best, porModelo.level);

      // Las dos fuentes dicen el mismo nombre: manda el catálogo, que es el que
      // se puede leer y corregir. Coincidir no lo hace más cierto, pero sí saca
      // la duda de encima de una corrección — que es cambiarle el nombre a la
      // botella que la persona tiene en la mano. Y una corrección respaldada por
      // dos fuentes deja de ser una sugerencia.
      if (veredictoLocal && fold(veredictoLocal.name) === fold(veredicto.name)) {
        return {
          ...veredictoLocal,
          status: veredictoLocal.status === "sugerido" ? "corregido" : veredictoLocal.status,
          mismatches: delModelo.mismatches || [],
        };
      }

      return { ...veredicto, mismatches: delModelo.mismatches || [] };
    }
  }

  // El modelo no supo o no coincidió: queda lo que haya dicho lo local, que
  // puede ser una corrección del catálogo (fuente auditable, alcanza sola), una
  // sugerencia para confirmar, o nada.
  return veredictoLocal || SIN_VERIFICAR;
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

module.exports = {
  searchWines,
  searchCatalog,
  guessType,
  getCatalogPool,
  isCuratedWine,
  findMatch,
  identifyReading,
  candidatosParaLectura,
  verifyReading,
};
