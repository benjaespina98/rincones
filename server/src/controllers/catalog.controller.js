const catalogService = require("../services/catalog.service");
const wineReviews = require("../services/wineReviews.service");
const recommendations = require("../services/recommendations.service");
const Wine = require("../models/wine.model");
const User = require("../models/user.model");
const { describeWine, suggestRecipe, classifyDish, PLANS } = require("../services/wineAi.service");
const wineImages = require("../services/wineImages.service");
const winePrices = require("../services/winePrices.service");
const WineInfo = require("../models/wineInfo.model");
const { describeKey } = require("../services/wineDescription.service");
const { fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");
const { conFotoPrimero, separarPorFoto } = require("../utils/destacados");
const communityWines = require("../services/communityWines.service");
const WineRecipe = require("../models/wineRecipe.model");
const DishPairing = require("../models/dishPairing.model");

/**
 * Le pega a cada resultado lo que VOS ya tenés de ese vino.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * Se reportó como "guardo un vino con cosecha 2023 y en la búsqueda no aparece
 * la cosecha". El síntoma era ése; la causa es más de fondo y explicaba varias
 * rarezas a la vez: la búsqueda no sabía qué vinos ya son tuyos.
 *
 * La fila comunitaria NO tiene cosecha, y está bien que no la tenga: su clave es
 * nombre + uva + bodega (ver `poolKey`), o sea que representa al VINO, no a la
 * botella. Si guardara un año, el 2023 que cargaste vos aparecería en la
 * búsqueda de otra persona que está mirando el 2019 — un dato peor que ninguno.
 * Por eso `communityWines.search` devuelve `vintage: ""` y por eso `findMatch`
 * dice, textual, que la cosecha nunca se adopta del catálogo: es de la botella.
 *
 * Entonces la cosecha correcta existe, pero no en el catálogo: está en TU vino.
 * Cruzar las dos cosas es lo que hace que el mismo vino se represente igual en
 * los dos lados, que era la regla. Y de paso arregla la clase entera, no el
 * campo: el resultado pasa a saber tu añada, tu stock y si ya lo probaste, así
 * que la tarjeta puede dejar de ofrecerte "Quiero probar" un vino que tenés
 * hace un año en la cava.
 *
 * ── POR QUÉ ACÁ Y NO EN EL CLIENTE ──────────────────────────────────────────
 * Porque la ruta ya está autenticada y esto es UNA consulta indexada por
 * usuario, contra un puñado de campos. Hacerlo del otro lado obligaría a que la
 * home se bajara la colección entera para pintar una chip.
 *
 * Nunca lanza: si esto falla, la búsqueda devuelve lo de siempre.
 */
/**
 * La parte pura: cruzar resultados contra tus vinos. Se exporta para poder
 * probarla sin base, que es donde vive la regla que importa.
 */
const anotarLoQueTenes = (results, mios) => {
  // Un vino tuyo por clave de identidad. Puede haber VARIOS: el 2019 y el 2021
  // del mismo vino son dos filas en tu bodega y una sola acá, así que se
  // agrupan en vez de que el último pise al primero.
  const porClave = new Map();
  for (const w of mios || []) {
    const clave = poolKey(w.name, w.winery, w.varietal);
    if (!clave) continue;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(w);
  }

  return results.map((r) => {
    const clave = poolKey(r.name, r.winery, r.varietal);
    const tuyos = clave ? porClave.get(clave) : null;
    if (!tuyos?.length) return r;

    // A cuál se entra al tocar: el que tiene botellas, y entre ésos el de la
    // añada más nueva. Si no queda ninguno, el más reciente que tuviste — que
    // es el que guarda tus notas y tus momentos.
    const conStock = tuyos.filter((w) => Number(w.quantity) > 0);
    const preferidos = conStock.length > 0 ? conStock : tuyos;
    const elegido = [...preferidos].sort(
      (a, b) => (Number(b.vintage) || 0) - (Number(a.vintage) || 0)
    )[0];

    return {
      ...r,
      owned: {
        id: String(elegido._id),
        // Las añadas que tenés, de la más nueva a la más vieja. Es lo que la
        // tarjeta muestra en lugar de la cosecha vacía del catálogo.
        vintages: [...new Set(tuyos.map((w) => w.vintage).filter(Boolean))].sort(
          (a, b) => b - a
        ),
        bottles: tuyos.reduce((n, w) => n + (Number(w.quantity) || 0), 0),
        tasted: tuyos.some((w) => w.tasted === true),
        entries: tuyos.length,
      },
    };
  });
};

const conLoQueYaTenes = async (userId, results) => {
  if (!userId || !results?.length) return results;

  try {
    const mios = await Wine.find({ userId })
      .select("name winery varietal vintage quantity tasted")
      .lean();
    return anotarLoQueTenes(results, mios);
  } catch {
    // Saber qué tenés es una mejora sobre una búsqueda que ya funciona.
    return results;
  }
};

// GET /api/catalog/search?q=...
const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ data: [], degraded: false });
    }

    const { results, degraded } = await catalogService.searchWines(q);
    // Pegamos las fotos "stock" que otros usuarios hayan subido.
    const conImagenes = await wineImages.enrichWithImages(results);
    // …y lo que ya tenés de cada uno, que es de dónde sale la cosecha.
    const withImages = await conLoQueYaTenes(req.user?.id, conImagenes);

    /**
     * Con foto primero, y no sólo con foto. Mismo criterio que `featured` (ver
     * más abajo en este archivo): la tarjeta de un vino es casi toda imagen, y
     * el placeholder genérico —la misma botella dibujada para cualquier vino—
     * no distingue nada. Es un ORDEN, no un filtro: nunca se descarta un
     * resultado por no tener foto, sólo se lo pospone. Estable dentro de cada
     * grupo, así que la relevancia de la búsqueda se conserva adentro de "con
     * foto" y adentro de "sin foto".
     *
     * Este endpoint alimenta dos pantallas: el buscador de Descubrí y el
     * "Para descubrir" del Sommelier (que hace varias búsquedas, una por uva, y
     * las intercala). Arreglarlo acá alcanza para las dos.
     */
    const data = withImages
      .map((wine, i) => ({ wine, i }))
      .sort((a, b) => {
        const fotoA = Boolean(a.wine.image);
        const fotoB = Boolean(b.wine.image);
        if (fotoA !== fotoB) return fotoA ? -1 : 1;
        return a.i - b.i;
      })
      .map(({ wine }) => wine);

    return res.status(200).json({ data, degraded });
  } catch (error) {
    return next(error);
  }
};

// Se usaba una copia local de `fold`. Es la misma que exporta data/argentineWines
// y la que usan todas las claves compartidas: dos definiciones de cómo se
// normaliza un nombre es la forma más segura de que un día dejen de coincidir.

// POST /api/catalog/describe { name, winery, varietal, type, region, vintage }
// Devuelve la ficha (estilo Vivino) del vino, generada por Gemini y cacheada.
const describe = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }
    const winery = String(req.body.winery || "").trim();
    const varietal = String(req.body.varietal || "").trim();
    // La misma clave que usa el alta del vino (wineDescription.service): si acá
    // se armara distinto, el vino que ya tiene ficha volvería a generarla.
    const key = describeKey(name, winery, varietal);

    // Cache compartida primero.
    try {
      const cached = await WineInfo.findOne({ key }).lean();
      if (cached?.info) return res.status(200).json({ data: cached.info, cached: true });
    } catch {
      // Sin cache: seguimos y generamos.
    }

    const info = await describeWine({
      name,
      winery,
      varietal,
      type: String(req.body.type || "").trim(),
      region: String(req.body.region || "").trim(),
      vintage: req.body.vintage,
    });

    if (!info) {
      return res.status(503).json({ message: "No se pudo generar la descripción ahora" });
    }

    try {
      await WineInfo.updateOne({ key }, { $set: { key, info } }, { upsert: true });
    } catch {
      // El cache es una optimización; devolvemos igual.
    }

    return res.status(200).json({ data: info, cached: false });
  } catch (error) {
    return next(error);
  }
};

// POST /api/catalog/recipe { name, winery, varietal, type, region, plan }
// Un plato con receta para acompañar la botella, según el plan de la noche.
// Misma mecánica que /describe: caché compartida primero, IA sólo si hace falta.
const recipe = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }

    const winery = String(req.body.winery || "").trim();
    // Un plan desconocido cae en "cena": es el más neutro de los cuatro y evita
    // que un valor viejo del cliente rompa la clave de caché.
    const plan = Object.keys(PLANS).includes(req.body.plan) ? req.body.plan : "cena";
    // Con la uva adentro, igual que la ficha, las fotos, los precios y las
    // reseñas: sin ella, un "Rutini Malbec" y un "Rutini Cabernet" compartían
    // receta, y el mismo vino se cacheaba dos veces según viniera de tu bodega
    // ("Rutini") o del catálogo ("Rutini Malbec").
    const key = `${poolKey(name, winery, String(req.body.varietal || "").trim())}|${plan}`;

    try {
      const cached = await WineRecipe.findOne({ key }).lean();
      if (cached?.recipe) return res.status(200).json({ data: cached.recipe, cached: true });
    } catch {
      // Sin caché: generamos.
    }

    const data = await suggestRecipe(
      {
        name,
        winery,
        varietal: String(req.body.varietal || "").trim(),
        type: String(req.body.type || "").trim(),
        region: String(req.body.region || "").trim(),
      },
      plan
    );

    if (!data) {
      return res.status(503).json({ message: "No se pudo armar la receta ahora" });
    }

    try {
      await WineRecipe.updateOne({ key }, { $set: { key, recipe: data } }, { upsert: true });
    } catch {
      // La caché es una optimización; la receta ya está lista.
    }

    return res.status(200).json({ data, cached: false });
  } catch (error) {
    return next(error);
  }
};

// POST /api/catalog/pairing { dish }
// Traduce un plato escrito a mano a una categoría de maridaje. El cliente sólo
// llega acá cuando su tabla local no lo reconoció, así que lo normal es que esto
// casi no se llame.
const pairing = async (req, res, next) => {
  try {
    const dish = String(req.body.dish || "").trim().slice(0, 80);
    if (dish.length < 3) {
      return res.status(400).json({ message: "Escribí qué vas a comer" });
    }

    const key = fold(dish);

    try {
      const cached = await DishPairing.findOne({ key }).lean();
      if (cached?.food) {
        return res.status(200).json({ data: { food: cached.food, note: cached.note || "" }, cached: true });
      }
    } catch {
      // Sin caché: clasificamos.
    }

    const data = await classifyDish(dish);
    if (!data) {
      return res.status(503).json({ message: "No se pudo interpretar ese plato ahora" });
    }

    try {
      await DishPairing.updateOne({ key }, { $set: { key, ...data } }, { upsert: true });
    } catch {
      // La caché es una optimización.
    }

    return res.status(200).json({ data, cached: false });
  } catch (error) {
    return next(error);
  }
};

// GET /api/catalog/featured - vinos destacados para la home Descubrí.
const DESTACADOS = 8;

/** La semilla del día: mismo set mientras dura la jornada, otro mañana. */
const semillaDelDia = () => Math.floor(Date.now() / (1000 * 60 * 60 * 24));

const featured = async (req, res, next) => {
  try {
    /**
     * El perfil sale de dos consultas baratas y en paralelo: la bodega (qué
     * compró de verdad) y el onboarding (qué dijo que le gusta). Las dos son
     * `lean` y proyectadas a los pocos campos que puntúan — no hace falta traer
     * los vinos enteros para saber qué uvas toma.
     *
     * Si alguna falla, el perfil queda vacío y la home sigue funcionando con el
     * catálogo sin personalizar: una recomendación genérica es mucho mejor que
     * una pantalla vacía.
     */
    const [wines, user] = await Promise.all([
      Wine.find({ userId: req.user.id })
        .select("name winery varietal region type rating")
        .lean()
        .catch(() => []),
      User.findById(req.user.id).select("preferences").lean().catch(() => null),
    ]);

    const perfil = recommendations.buildTasteProfile({
      wines,
      preferences: user?.preferences || {},
    });

    /**
     * Se arma el universo (catálogo curado + lo que la gente cargó con foto), se le pega la foto
     * del pool compartido a quien la tenga, y se recomienda CON FOTO primero.
     *
     * Con foto porque la tarjeta grande de Descubrí luce mucho más con la botella real. Pero es una
     * PRIORIDAD y no un filtro: si con foto no alcanzan los ocho, se completa con los que no la
     * tienen (que se ven como antes, con la botella genérica) y la pantalla nunca queda sin
     * recomendación. A medida que se carguen más vinos con su foto, habrá más para recomendar.
     *
     * El orden dentro de cada grupo es el de afinidad con el gusto de la persona.
     */
    const curado = catalogService.getCatalogPool();
    const vistos = new Set(curado.map((w) => poolKey(w.name, w.winery, w.varietal)));
    const comunitarios = (await communityWines.conFoto(300)).filter(
      (w) => !vistos.has(poolKey(w.name, w.winery, w.varietal))
    );
    const universo = await wineImages.enrichWithImages([...curado, ...comunitarios]);
    const { con, sin } = separarPorFoto(universo);
    const semilla = semillaDelDia();
    const conFoto = recommendations.rankFeatured(con, perfil, { count: DESTACADOS, seed: semilla });
    const faltan = DESTACADOS - conFoto.length;
    const sinFoto = faltan > 0 ? recommendations.rankFeatured(sin, perfil, { count: faltan, seed: semilla }) : [];
    const data = conFotoPrimero([...conFoto, ...sinFoto], DESTACADOS);
    // `private` y no `public`: desde que el set se arma con la bodega y las
    // preferencias de quien pregunta, la respuesta es de ESA persona y un proxy
    // compartido no puede servírsela a otra.
    //
    // Diez minutos siguen estando bien: dentro del día la selección sólo cambia
    // si la persona carga un vino nuevo, y que la home tarde unos minutos en
    // enterarse es preferible a pagar dos consultas cada vez que se vuelve de
    // otra pestaña.
    res.set("Cache-Control", "private, max-age=600");
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// GET /api/catalog/price?name=&winery=&varietal= - precio comunitario (promedio).
// La uva va en la clave: el nombre visible ya no la incluye y sin ella dos uvas
// de la misma línea compartirían precio.
//
// Tu propio precio no cuenta para tu promedio: lo que este endpoint contesta es
// "cuánto lo paga la gente", y devolverte lo que pagaste vos disfrazado de
// promedio de la comunidad es la única respuesta que no sirve para nada. Ver
// `getPrice` en winePrices.service.js.
const price = async (req, res, next) => {
  try {
    const data = await winePrices.getPrice(
      String(req.query.name || ""),
      String(req.query.winery || ""),
      String(req.query.varietal || ""),
      req.user?.id || ""
    );
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// El endpoint `match` se fue: el cruce contra el catálogo dejó de ser una
// llamada aparte del navegador y ocurre dentro de la lectura de la etiqueta,
// donde además se verifica el nombre. `catalogService.findMatch` sigue vivo y lo
// usa ese camino; ver labels.controller.js.

// GET /api/catalog/reviews?name=&winery= - reseñas públicas de un vino.
const reviews = async (req, res, next) => {
  try {
    const data = await wineReviews.listReviews(
      String(req.query.name || ""),
      String(req.query.winery || ""),
      req.user.id,
      20,
      String(req.query.varietal || "")
    );
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// GET /api/catalog/reviews/mine - tus reseñas, para el perfil.
//
// ── POR QUÉ VIAJA TAMBIÉN EL ID DEL VINO ────────────────────────────────────
// Una reseña se guarda contra la CLAVE del vino (nombre + uva + bodega), no
// contra una botella de tu bodega: así una puntuación tuya sigue valiendo aunque
// borres el vino, y la misma reseña la ve cualquiera que busque ese vino. Pero
// la lista del perfil se lee como "los vinos que valoré", y tocar uno tiene que
// llevar al vino — para lo cual hace falta un id, que la reseña no tiene.
//
// Se resuelve acá y no en el cliente porque acá la respuesta cuesta una consulta
// más, chica y del propio usuario (sólo los cuatro campos de la identidad); en
// el cliente costaba bajar la bodega ENTERA en una pantalla que hoy no la
// necesita para nada.
//
// El que no matchea no es un error: es un vino que valoraste y ya no tenés
// —o que puntuaste desde el catálogo sin sumarlo—. Va sin `wineId`, y el
// cliente lo manda a la ficha del catálogo, que se arma con estos mismos datos.
const myReviews = async (req, res, next) => {
  try {
    const data = await wineReviews.listByUser(req.user.id);

    if (data.length > 0) {
      const mios = await Wine.find({ userId: req.user.id })
        .select("name winery varietal")
        .lean();
      // La misma fórmula con la que se clavea la reseña: las dos formas de
      // nombrar un vino —"Rutini" con la uva aparte, "Rutini Malbec" todo
      // junto— caen en la misma clave y matchean igual.
      const porClave = new Map();
      for (const w of mios) {
        const clave = poolKey(w.name, w.winery, w.varietal);
        if (clave && !porClave.has(clave)) porClave.set(clave, String(w._id));
      }
      for (const r of data) {
        const id = porClave.get(poolKey(r.name, r.winery, r.varietal));
        if (id) r.wineId = id;
      }
    }

    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// POST /api/catalog/reviews - publica o edita tu reseña de un vino.
//
// Publicar es explícito: el rating privado del vino NO se expone solo. Sólo
// cuando el usuario manda esto, su puntuación y su texto se vuelven públicos.
const publishReview = async (req, res, next) => {
  try {
    const { name, winery, varietal, vintage, rating, text } = req.body;
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }

    // El autor se muestra con nombre de pila + avatar. Nunca apellido ni mail.
    let author = { name: "", avatar: "" };
    try {
      const u = await User.findById(req.user.id).select("firstName avatar email").lean();
      author = {
        name: (u?.firstName || "").trim() || (u?.email || "").split("@")[0] || "Alguien",
        avatar: u?.avatar || "",
      };
    } catch {
      // Sin perfil: la reseña se publica igual, sin nombre.
    }

    const doc = await wineReviews.upsertReview({
      userId: req.user.id,
      name,
      winery,
      varietal,
      vintage,
      rating,
      text,
      author,
    });
    return res.status(201).json({ data: doc });
  } catch (error) {
    if (/puntuación|datos del vino/i.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
};

// DELETE /api/catalog/reviews - borra tu reseña (deja de ser pública).
const removeReview = async (req, res, next) => {
  try {
    const ok = await wineReviews.deleteReview({
      userId: req.user.id,
      name: String(req.query.name || req.body?.name || ""),
      winery: String(req.query.winery || req.body?.winery || ""),
      varietal: String(req.query.varietal || req.body?.varietal || ""),
    });
    if (!ok) return res.status(404).json({ message: "No tenías una reseña de este vino" });
    return res.status(200).json({ message: "Reseña eliminada" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  search,
  describe,
  recipe,
  pairing,
  featured,
  price,
  reviews,
  myReviews,
  publishReview,
  removeReview,
  // Se exporta para el test: es la regla de "este vino ya es tuyo", y conviene
  // que esté fijada sin depender de una base.
  anotarLoQueTenes,
};
