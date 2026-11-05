// Búsqueda de vinos conocidos.
//
// Delega en el server (/api/catalog/search): antes se llamaba a Open Food Facts
// directo desde el browser y CORS lo bloqueaba en cada búsqueda, lo que la UI
// mostraba como "Sin resultados". El server además prioriza vino argentino.

import api from "./api";

/**
 * Busca vinos por texto. Devuelve un array normalizado.
 * Lanza si la búsqueda falla, para que la UI distinga "no hay resultados"
 * de "no pudimos buscar".
 */
export const searchWines = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const { data } = await api.get("/catalog/search", { params: { q } });
  return Array.isArray(data?.data) ? data.data : [];
};

/**
 * Vinos destacados para la home Descubrí (catálogo curado, sin gastar cuota IA).
 *
 * ── POR QUÉ SE CACHEA ──────────────────────────────────────────────────────
 * Dentro del día, dos llamadas devuelven lo mismo: el set se arma con tu bodega
 * y tus preferencias, más la fecha como desempate (ver `rankFeatured` en
 * server/src/services/recommendations.service.js). Y la estábamos pidiendo en
 * cada montaje de Descubrí — cada vez que volvés a la home desde otra pestaña.
 *
 * Eso importaba más de lo que parece: el resto de la pantalla es data local y se
 * pinta en el primer frame, así que esta era la ÚNICA pieza que esperaba a la
 * red, y encima pasa por `authenticate`, con lo que en un arranque en frío podía
 * encadenarse detrás de una renovación de sesión. La tarjeta principal de la
 * home llegaba última por pedir algo que ya sabíamos.
 *
 * ── PERSISTE ENTRE ARRANQUES ────────────────────────────────────────────────
 * Antes vivía en `sessionStorage`: servía mientras la pestaña seguía abierta, pero cada arranque en frío de
 * la app (abrir la PWA, una pestaña nueva) la perdía y la tarjeta esperaba a la red de nuevo —varios
 * segundos en el primer toque del día, con el resto de la pantalla ya pintado—. Como el set es estable
 * todo el día, ahora va en `localStorage` y el segundo arranque lo pinta al instante.
 *
 * Sigue siendo seguro compartir el navegador: la clave lleva la persona (el set sale de SU bodega) y la
 * fecha (a la medianoche deja de servir sola). Al cerrar sesión, al cargar un vino y al borrar los datos
 * locales se tiran todas (ver `invalidarDestacados`), y las de días anteriores se limpian al guardar.
 */
const FEATURED_KEY = "rincones_featured";

/**
 * Cuánto vale lo guardado. Los motivos de la tarjeta afirman hechos de tu bodega («Tomaste Malbec», «Tenés
 * Malbec en tu bodega») y la bodega cambia: con la fecha sola un set podía quedar mintiendo hasta la
 * medianoche. Seis horas más la invalidación al tocar la bodega o los deseos (ver wineApi y wishApi).
 */
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

/**
 * Se guarda sin las fotos subidas desde el teléfono (`data:`): son cientos de KB cada una y el set trae doce.
 * `localStorage` tiene ~5 MB por origen y se los comería a todos (el token, los filtros). La tarjeta no las
 * usa; si hace falta una foto, la ficha del vino la trae.
 */
const liviano = (vinos) => vinos.map((w) => (typeof w?.image === "string" && w.image.startsWith("data:") ? { ...w, image: "" } : w));

const hoyEnArgentina = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const guardar = (clave, valor) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Cuota llena o modo privado: el caché es una mejora, no un requisito.
  }
};

const leer = (clave) => {
  try {
    const guardado = localStorage.getItem(clave);
    if (!guardado) return null;
    const { t, set } = JSON.parse(guardado);
    const vigente = Number.isFinite(t) && Date.now() - t < VIGENCIA_MS && Date.now() >= t;
    return vigente && Array.isArray(set) && set.length > 0 ? set : null;
  } catch {
    // Sin storage o JSON corrupto: se pide por red, como antes.
    return null;
  }
};

/** Las claves de destacados que hay guardadas, de cualquier persona o día. */
const clavesGuardadas = () => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(FEATURED_KEY));
  } catch {
    return [];
  }
};

export const getFeaturedWines = async (userId = "") => {
  // Sin saber de quién es el set no se lee ni se guarda nada: una clave común mezclaría a las personas.
  const clave = userId ? `${FEATURED_KEY}_${userId}_${hoyEnArgentina()}` : "";

  const guardado = clave ? leer(clave) : null;
  if (guardado) return guardado;

  const { data } = await api.get("/catalog/featured");
  const results = Array.isArray(data?.data) ? data.data : [];

  // Sólo se guarda si hay algo: cachear una lista vacía dejaría la home sin recomendación hasta la
  // medianoche por un fallo puntual del server.
  if (clave && results.length > 0) {
    // De paso se tira lo de días anteriores y de otras personas, que ya no sirve y sólo ocuparía lugar.
    for (const k of clavesGuardadas()) {
      if (k !== clave) {
        try {
          localStorage.removeItem(k);
        } catch {
          // Nada que hacer.
        }
      }
    }
    guardar(clave, JSON.stringify({ t: Date.now(), set: liviano(results) }));
  }

  return results;
};

/**
 * Tira el caché de destacados.
 *
 * Hace falta desde que el set depende de tu bodega: cargar un vino cambia lo que
 * corresponde recomendar —el que acabás de cargar deja de ser una sugerencia,
 * porque ya lo tenés—, y sin esto la home seguiría ofreciéndotelo hasta la
 * medianoche. Se llama al crear un vino, al cerrar sesión y al borrar los datos locales.
 */
export const invalidarDestacados = () => {
  for (const k of clavesGuardadas()) {
    try {
      localStorage.removeItem(k);
    } catch {
      // Sin storage no hay caché que tirar: no hay nada que hacer.
    }
  }
  try {
    // El formato anterior (sessionStorage, sin persona): por si quedó alguno de una versión vieja.
    for (const k of Object.keys(sessionStorage).filter((x) => x.startsWith(FEATURED_KEY))) sessionStorage.removeItem(k);
  } catch {
    // Nada que hacer.
  }
};

/**
 * Precio comunitario de un vino (promedio de lo que pagó la gente).
 * Devuelve { avg, count, min, max, currency } o null.
 */
export const getWinePrice = async (name, winery, varietal = "") => {
  const { data } = await api.get("/catalog/price", { params: { name, winery, varietal } });
  return data?.data || null;
};

// URL de búsqueda del vino en MercadoLibre (siempre actual, sin API).
// Lleva la uva: el nombre visible ya no la incluye y "Saint Felicien" a secas
// devuelve las cuatro uvas de la línea mezcladas.
export const mercadoLibreUrl = (name, winery, varietal = "") => {
  const q = [name, varietal, winery].filter(Boolean).join(" ");
  return `https://listado.mercadolibre.com.ar/${encodeURIComponent(q)}`;
};

/**
 * Trae la ficha del vino (descripción, aromas, maridaje) generada por IA y
 * cacheada en el server. Lanza si falla, para que la UI muestre un estado claro.
 */
export const describeWine = async (wine) => {
  const { data } = await api.post("/catalog/describe", {
    name: wine.name,
    winery: wine.winery,
    varietal: wine.varietal,
    type: wine.type,
    region: wine.region,
    vintage: wine.vintage,
  });
  return data?.data || null;
};

/**
 * Un plato con receta para acompañar la botella, según el plan de la noche.
 * Se pide sólo cuando el usuario la pide: es la única parte del "plan de la
 * noche" que cuesta una llamada. El server la cachea por vino + plan.
 */
export const getWineRecipe = async (wine, plan) => {
  const { data } = await api.post("/catalog/recipe", {
    name: wine.name,
    winery: wine.winery,
    varietal: wine.varietal,
    type: wine.type,
    region: wine.region,
    plan,
  });
  return data?.data || null;
};

/**
 * Traduce un plato escrito a mano ("risotto de hongos") a una categoría de
 * maridaje. Sólo se llama cuando la tabla local del cliente no lo reconoció.
 */
export const classifyDish = async (dish) => {
  const { data } = await api.post("/catalog/pairing", { dish });
  return data?.data || null;
};

// Acá vivía `matchCatalogWine`, que el escáner llamaba después de leer la
// etiqueta para completar los huecos. Ya no existe de este lado: el cruce contra
// el catálogo —y la verificación del nombre, que es lo que no se hacía— pasa
// dentro de /labels/analyze, así que entre la foto y la revisión hay un solo
// viaje de red en vez de dos.
