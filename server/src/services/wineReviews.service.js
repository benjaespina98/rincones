// Reseñas comunitarias de vinos.
//
// Mismo espíritu que winePrices/wineImages: un pool compartido por vino
// (nombre + bodega normalizados). La diferencia es que acá guardamos cada
// reseña individual, no un agregado, porque el texto y el autor se muestran.

const WineReview = require("../models/wineReview.model");
const { poolKey } = require("../data/wineIdentity");

/**
 * La clave de una reseña: nombre + uva + bodega, la MISMA que usan las fotos y
 * los precios compartidos.
 *
 * ── POR QUÉ CAMBIÓ ──────────────────────────────────────────────────────────
 * Era `nombre|bodega`, sin la uva, y eso rompía dos cosas a la vez:
 *
 * 1. La misma botella daba claves distintas según desde dónde la miraras. En tu
 *    bodega el vino se llama "Rutini" (la uva es campo aparte) y en el catálogo
 *    "Rutini Malbec": puntuabas desde el catálogo y tu propia ficha no veía tu
 *    reseña ni tu promedio. Estaba pasando de verdad, con datos reales.
 * 2. Dos vinos distintos compartían reseñas. "Rutini Malbec" y "Rutini Cabernet"
 *    son botellas diferentes y caían en la misma clave: las opiniones de una
 *    aparecían en la otra.
 *
 * `poolKey` mete la uva adentro del nombre sólo si no está ya, así que las dos
 * formas convergen en la misma clave y las reseñas viejas —cuyo nombre traía la
 * uva— conservan la suya. No hace falta migrar nada.
 */
const wineKey = (name, winery, varietal = "") => poolKey(name, winery, varietal);

/**
 * Publica (o edita) la reseña del usuario para un vino.
 * Una por persona por vino: volver a publicar reemplaza la anterior.
 */
const upsertReview = async ({ userId, name, winery, varietal, vintage, rating, text, author }) => {
  const key = wineKey(name, winery, varietal);
  if (!key) throw new Error("Faltan datos del vino");

  const value = Number(rating);
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    throw new Error("La puntuación tiene que ser de 1 a 5");
  }

  // La cosecha es opcional y sólo se valida contra el calendario: un año
  // imposible se descarta en vez de rechazar la reseña entera, que es lo que la
  // persona vino a dejar.
  //
  // Se escribe `null` y no `undefined` a propósito: Mongoose saca del `$set` las
  // claves undefined, así que al editar una reseña que ya tenía cosecha, el año
  // viejo sobrevivía a un valor nuevo inválido —o a que el vino se hubiera
  // quedado sin añada—. Con null, la reseña refleja siempre lo último que se
  // mandó.
  const anio = Math.round(Number(vintage));
  const cosecha =
    Number.isFinite(anio) && anio >= 1900 && anio <= new Date().getFullYear() ? anio : null;

  const doc = await WineReview.findOneAndUpdate(
    { key, userId },
    {
      $set: {
        key,
        userId,
        rating: Math.round(value),
        text: String(text || "").trim().slice(0, 1000),
        authorName: String(author?.name || "").trim(),
        authorAvatar: String(author?.avatar || "").trim(),
        name: String(name || "").trim(),
        winery: String(winery || "").trim(),
        // Se guarda aunque la clave ya lo incorpore: sin esto, una reseña vieja
        // no se puede volver a clavear si algún día cambia la fórmula.
        varietal: String(varietal || "").trim(),
        vintage: cosecha,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
};

const deleteReview = async ({ userId, name, winery, varietal }) => {
  const key = wineKey(name, winery, varietal);
  if (!key) return false;
  const res = await WineReview.deleteOne({ key, userId });
  return res.deletedCount > 0;
};

/**
 * Reemplaza el nombre y el avatar guardados por los que la persona tiene HOY.
 *
 * El autor se copiaba dentro de la reseña al publicarla, así que quedaba
 * congelado: cambiabas tu nombre en el perfil y tus reseñas viejas seguían
 * firmadas con el anterior —o con la parte de tu mail antes del arroba, si
 * todavía no habías puesto nombre—. Para el que las lee, parecen de otra
 * persona.
 *
 * Una sola consulta para toda la lista. Lo guardado queda como respaldo: si la
 * cuenta se borró, la reseña se sigue leyendo con el nombre que tenía.
 *
 * Muta los documentos recibidos (ya vienen de `.lean()`, son objetos sueltos).
 */
const conNombresActuales = async (docs = []) => {
  const ids = [...new Set(docs.map((d) => String(d.userId)).filter(Boolean))];
  if (ids.length === 0) return docs;

  try {
    const User = require("../models/user.model");
    const users = await User.find({ _id: { $in: ids } }).select("firstName avatar").lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    for (const d of docs) {
      const u = byId.get(String(d.userId));
      if (!u) continue;
      // Sin nombre de pila vigente se conserva el que se guardó con la reseña; el
      // "Alguien" es sólo para cuando no hay ninguno (nunca el prefijo del mail).
      const actual = (u.firstName || "").trim() || (d.authorName || "").trim() || "Alguien";
      d.authorName = actual;
      d.authorAvatar = u.avatar || d.authorAvatar || "";
    }
  } catch {
    // Sin perfiles: se muestran los nombres guardados, que es como estaba antes.
  }
  return docs;
};

/**
 * Reseñas de un vino + resumen. `userId` sirve para separar la propia del
 * resto, así el cliente puede mostrarla como editable.
 */
const listReviews = async (name, winery, userId, limit = 20, varietal = "") => {
  const key = wineKey(name, winery, varietal);
  if (!key) return { summary: null, mine: null, reviews: [] };

  try {
    const docs = await WineReview.find({ key })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    /**
     * El promedio, cuántas son y cuántas hay de cada puntaje.
     *
     * Antes esto agrupaba por `key` y devolvía sólo avg y count. Agrupar por
     * RATING da las tres cosas de una: el reparto es el resultado de la
     * consulta, y el promedio y el total salen de sumarlo. Es la misma ida a la
     * base que ya se hacía —no una más— y con eso la ficha puede mostrar el
     * desglose, que es lo que separa "4.3 de 12 opiniones" de saber si esas 12
     * están de acuerdo o si son seis que lo aman y seis que lo odian.
     */
    const porPuntaje = await WineReview.aggregate([
      { $match: { key } },
      { $group: { _id: "$rating", n: { $sum: 1 } } },
    ]);

    // `dist[0]` son las de 1 estrella y `dist[4]` las de 5.
    const dist = [0, 0, 0, 0, 0];
    let total = 0;
    let suma = 0;
    for (const fila of porPuntaje) {
      const estrellas = Math.round(Number(fila._id));
      if (estrellas < 1 || estrellas > 5) continue;
      dist[estrellas - 1] = fila.n;
      total += fila.n;
      suma += estrellas * fila.n;
    }

    const summary = total > 0 ? { avg: Math.round((suma / total) * 10) / 10, count: total, dist } : null;

    await conNombresActuales(docs);

    const uid = String(userId || "");
    const mine = docs.find((d) => String(d.userId) === uid) || null;
    // A las reseñas ajenas no se les entrega el userId: no es de nadie más.
    const reviews = docs
      .filter((d) => String(d.userId) !== uid)
      .map(({ userId: _ajeno, ...publica }) => publica);

    return { summary, mine, reviews };
  } catch {
    return { summary: null, mine: null, reviews: [] };
  }
};

/**
 * Promedios para muchos vinos de una sola consulta. Lo usa la búsqueda para
 * poder mostrar estrellas en las tarjetas sin pegarle a la base por resultado.
 * Devuelve un Map keyed por `wineKey`.
 */
const getSummaries = async (wines = []) => {
  const keys = [...new Set(wines.map((w) => wineKey(w.name, w.winery, w.varietal)).filter(Boolean))];
  if (keys.length === 0) return new Map();

  try {
    const rows = await WineReview.aggregate([
      { $match: { key: { $in: keys } } },
      { $group: { _id: "$key", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    return new Map(
      rows.map((r) => [r._id, { avg: Math.round(r.avg * 10) / 10, count: r.count }])
    );
  } catch {
    // Las reseñas son un extra: si fallan, la búsqueda sigue funcionando.
    return new Map();
  }
};

/**
 * Todas las reseñas que escribió una persona, de la más nueva a la más vieja.
 *
 * Las puntuaciones se publicaban y desaparecían: quedaban en la ficha del vino
 * y en ningún lado propio. Para acordarte de cuánto le pusiste a algo había que
 * buscar la botella, que es justo lo que no se recuerda. En el perfil son, de
 * hecho, tu historial de puntajes.
 */
const listByUser = async (userId, limit = 50) => {
  try {
    return await WineReview.find({ userId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .select("name winery varietal vintage rating text createdAt updatedAt")
      .lean();
  } catch {
    return [];
  }
};

/**
 * Cuántas reseñas publicó esta persona, en total.
 *
 * Existe para que el perfil pueda decir "tenés N valoraciones" sin traerse la
 * lista entera sólo para contarla, y sobre todo para que ese número sea EL
 * MISMO que `listByUser` va a mostrar un toque después: antes el perfil contaba
 * cuántos vinos de TU BODEGA tenían `rating > 0` (una tabla distinta, la propia
 * de cada vino) mientras esta pantalla lista reseñas publicadas, que sobreviven
 * a que borres el vino o a que hayas puntuado uno que nunca sumaste a tu
 * bodega. Dos fuentes para el mismo dato es como el perfil llegó a decir "1
 * valoración" con dos reseñas esperando adentro.
 */
const countByUser = (userId) => WineReview.countDocuments({ userId }).catch(() => 0);

module.exports = {
  upsertReview,
  deleteReview,
  listReviews,
  listByUser,
  countByUser,
  getSummaries,
  wineKey,
};
