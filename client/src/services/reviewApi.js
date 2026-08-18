import api from "./api";

/**
 * Reseñas públicas de un vino.
 * Devuelve { summary: {avg, count} | null, mine: review | null, reviews: [] }.
 *
 * La uva va en las tres llamadas y no es opcional de verdad: es parte de la
 * identidad del vino. Sin ella, "Rutini" (como se llama en tu bodega) y "Rutini
 * Malbec" (como lo devuelve el catálogo) eran dos vinos distintos para las
 * reseñas, y tu propia puntuación no aparecía en tu propia ficha.
 */
/**
 * ── LA MISMA CONSULTA SALÍA DOS VECES POR CADA FICHA ────────────────────────
 *
 * `WineOpinion` (tu puntuación) y `WineReviews` (las de los demás) son dos
 * componentes hermanos que se montan juntos en la ficha del vino, y los dos
 * piden lo mismo: `/catalog/reviews` del mismo vino, con los mismos parámetros,
 * en el mismo instante. Dos viajes idénticos, uno al lado del otro, en la
 * pantalla que más se abre.
 *
 * No se arregla juntando los componentes —están separados a propósito, y por
 * buenos motivos: tu opinión va arriba, en "lo tuyo", y las ajenas al final—.
 * Se arregla acá, que es donde está el viaje: si ya hay uno en vuelo con la
 * misma clave, el segundo se cuelga de ése en vez de abrir otro.
 *
 * El resultado además se guarda unos segundos, así que volver atrás y entrar de
 * nuevo a la misma ficha pinta al instante. Es corto a propósito: la ventana
 * cubre el montaje y poco más, y cualquier cosa que escriba una reseña lo borra
 * en el acto (ver `olvidar`), así que nunca se ve un puntaje viejo propio.
 */
const CACHE_MS = 20_000;
const cache = new Map();

const claveDe = (name, winery, varietal) =>
  `${name || ""}|${winery || ""}|${varietal || ""}`.toLowerCase();

/** Borra lo cacheado de un vino. Se llama al publicar y al borrar. */
const olvidar = (name, winery, varietal) => cache.delete(claveDe(name, winery, varietal));

export const getWineReviews = async (name, winery = "", varietal = "") => {
  const clave = claveDe(name, winery, varietal);
  const guardado = cache.get(clave);
  // `promesa` cubre las dos situaciones con el mismo objeto: todavía en vuelo, o
  // ya resuelta y fresca. En los dos casos lo correcto es devolverla.
  if (guardado && Date.now() - guardado.at < CACHE_MS) return guardado.promesa;

  const promesa = api
    .get("/catalog/reviews", { params: { name, winery, varietal } })
    .then(({ data }) => data?.data || { summary: null, mine: null, reviews: [] })
    .catch((error) => {
      // Un fallo no se cachea: el próximo intento tiene que volver a preguntar.
      cache.delete(clave);
      throw error;
    });

  cache.set(clave, { at: Date.now(), promesa });
  return promesa;
};

/** Tus reseñas, de la más reciente a la más vieja. Para el perfil. */
export const getMyReviews = async () => {
  const { data } = await api.get("/catalog/reviews/mine");
  return Array.isArray(data?.data) ? data.data : [];
};

/** Publica (o edita) tu reseña. Esto es lo que la vuelve pública. */
/**
 * `vintage` es la cosecha que tomó QUIEN escribe, y viaja como dato de la
 * reseña, no como parte de la identidad del vino: el promedio sigue siendo uno
 * solo para todas las añadas (ver el modelo en el server). Se muestra al lado
 * del autor, que es donde contesta la pregunta "¿cuál probó?".
 */
export const publishWineReview = async ({ name, winery, varietal, vintage, rating, text }) => {
  const { data } = await api.post("/catalog/reviews", { name, winery, varietal, vintage, rating, text });
  // Lo cacheado quedó viejo en el momento exacto en que se guardó esto.
  olvidar(name, winery, varietal);
  return data?.data || null;
};

/** Borra tu reseña: deja de aparecer para el resto. */
export const deleteWineReview = async (name, winery = "", varietal = "") => {
  const { data } = await api.delete("/catalog/reviews", { params: { name, winery, varietal } });
  olvidar(name, winery, varietal);
  return data;
};
