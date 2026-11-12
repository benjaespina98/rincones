const catalogService = require("../services/catalog.service");
const wineReviews = require("../services/wineReviews.service");
const recommendations = require("../services/recommendations.service");
const Wine = require("../models/wine.model");
const User = require("../models/user.model");
const wineAi = require("../services/wineAi.service");
const { PLANS } = wineAi;

/**
 * Los tres controladores de abajo ya saben qué contestar cuando el modelo no
 * devuelve nada: un 503 con un mensaje pensado. Pero el servicio no devuelve
 * `null` cuando Gemini falla (429, 503, timeout): LANZA, y eso salía como un 500
 * genérico más un evento de error por cada bache del proveedor. Acá la falla
 * del modelo se vuelve lo que es para estas pantallas, "ahora no se pudo".
 */
const oNada = (nombre) => async (...args) => {
  try {
    return await wineAi[nombre](...args);
  } catch (error) {
    console.error(`[catalog] ${nombre} falló:`, error?.message || error);
    return null;
  }
};
const describeWine = oNada("describeWine");
const suggestRecipe = oNada("suggestRecipe");
const classifyDish = oNada("classifyDish");
const wineImages = require("../services/wineImages.service");
const winePrices = require("../services/winePrices.service");
const WineInfo = require("../models/wineInfo.model");
const WineWish = require("../models/wineWish.model");
const { describeKey } = require("../services/wineDescription.service");
const { fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");
const { conFotoPrimero } = require("../utils/destacados");
const { limpiarDato } = require("../utils/promptSeguro");
const { esImagenAceptada } = require("../utils/imagenAceptada");
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
    const q = String(req.query.q || "").trim().slice(0, 100);
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

// Lo que entra al prompt y a una caché que ven TODOS los usuarios. Largo acotado y
// sin caracteres de control. Type, region y vintage NO viajan al prompt de lo
// que se cachea: no están en la clave y servirían para sembrar texto en la ficha
// que ven todos.
const textoCorto = (v, max = 120) => limpiarDato(v, max);
// POST /api/catalog/describe { name, winery, varietal, type, region, vintage }
// Devuelve la ficha (estilo Vivino) del vino, generada por Gemini y cacheada.
const describe = async (req, res, next) => {
  try {
    const name = textoCorto(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }
    const winery = textoCorto(req.body.winery);
    const varietal = textoCorto(req.body.varietal);
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
    const name = textoCorto(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }

    const winery = textoCorto(req.body.winery);
    // Un plan desconocido cae en "cena": es el más neutro de los cuatro y evita
    // que un valor viejo del cliente rompa la clave de caché.
    const plan = Object.keys(PLANS).includes(req.body.plan) ? req.body.plan : "cena";
    // Con la uva adentro, igual que la ficha, las fotos, los precios y las
    // reseñas: sin ella, un "Rutini Malbec" y un "Rutini Cabernet" compartían
    // receta, y el mismo vino se cacheaba dos veces según viniera de tu bodega
    // ("Rutini") o del catálogo ("Rutini Malbec").
    const varietalReceta = textoCorto(req.body.varietal);
    const key = `${poolKey(name, winery, varietalReceta)}|${plan}`;

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
        varietal: varietalReceta,
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
// Doce y no ocho: "Ver otro" recorre el set, y con un universo grande hay de dónde elegir.
const DESTACADOS = 12;

// Desde qué puntaje (0-100, ver wineImageQuality) una foto del pool es lo bastante buena como para ser la cara de
// la tarjeta de Descubrí: una botella o etiqueta bien encuadrada. Más abajo, o sin puntaje, se dibuja la botella.
const FOTO_CONFIABLE_MIN = 70;

// Cuánto puede mover el desempate diario a un vino de lugar (ver `rankFeatured`).
// Máximo 1: menos que lo que pesa la región (1,5) y que lo que suman la foto y la buena identificación
// juntas (1,25) con lo que pesa la uva (3), para que la rotación mueva a los parecidos y nunca ponga
// delante a un vino sin ninguna afinidad.
const JITTER_DIARIO = 1;

// Un entero estable por persona, para que dos personas con el mismo gusto no reciban el mismo set.
const semillaDePersona = (id) => {
  let h = 7;
  for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 9973);
};

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
    const [wines, user, guardados] = await Promise.all([
      Wine.find({ userId: req.user.id })
        .select("name winery line varietal region type rating quantity tasted")
        .lean()
        .catch(() => []),
      User.findById(req.user.id).select("preferences").lean().catch(() => null),
      // Lo que ya guardó para probar tampoco se recomienda: ya lo tiene en la mira.
      WineWish.find({ userId: req.user.id }).select("name winery varietal").lean().catch(() => []),
    ]);

    const perfil = recommendations.buildTasteProfile({
      wines,
      preferences: user?.preferences || {},
    });

    /**
     * El universo es TODO lo que hay: el catálogo curado más lo que cargó la gente (el catálogo
     * comunitario, con o sin foto), menos lo que esta persona ya tiene. Se rankea por gusto, y la
     * foto y la buena identificación SUMAN puntos pero no filtran:
     *
     *   · foto (+0,75): la tarjeta grande luce mucho más con la botella real. Pero un vino que todavía
     *     no tiene foto puede ser la mejor recomendación, y entra igual.
     *   · bien identificado (+0,5 / +0,25): un vino confirmado por dos personas, o leído con
     *     confianza, sale antes que uno dudoso del mismo gusto.
     *
     * Las fotos vienen de la base de TODAS las personas: la del catálogo comunitario y el pool
     * compartido (`WineImage`). Para no traer cientos de imágenes pesadas se sabe SI tiene foto
     * (consulta liviana) y recién se pide la imagen de los pocos elegidos.
     *
     * Para que no sean siempre los mismos: con un universo grande, vinos de gusto parecido rotan de
     * un día al otro (`jitter`) y distintas personas reciben desempates distintos (la semilla suma
     * la persona). Dentro del día el set es estable.
     */
    const curado = catalogService.getCatalogPool();
    // `poolKey` devuelve null con un nombre demasiado corto: esas entradas no entran a los conjuntos (si no,
    // un null descartaría a todos los demás que tampoco tienen clave).
    const claveOk = (w) => poolKey(w.name, w.winery, w.varietal) || null;
    const propios = new Set([...wines, ...guardados].map(claveOk).filter(Boolean));
    const vistos = new Set(curado.map(claveOk).filter(Boolean));
    const comunitarios = (await communityWines.paraRecomendar(800)).filter((w) => {
      const k = claveOk(w);
      if (!k) return true;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    // Lo que ya tenés no se recomienda, aunque lo tengas escrito de otra forma (misma clave de
    // identidad que usa todo el catálogo).
    const universo = [...curado, ...comunitarios].filter((w) => !propios.has(claveOk(w)));

    const clavesConFoto = await wineImages.keysConFoto(universo);
    const tieneFoto = (w) =>
      w.fotoDiferida === true || esImagenAceptada(w.image) || clavesConFoto.has(poolKey(w.name, w.winery, w.varietal));
    const calidad = (w) => (w.source === "catalogo-ar" || w.source === "comunidad-verificada" ? 0.5 : w.confiable ? 0.25 : 0);

    const elegidos = recommendations.rankFeatured(universo, perfil, {
      count: DESTACADOS,
      seed: semillaDelDia() + semillaDePersona(req.user.id),
      extra: (w) => (tieneFoto(w) ? 0.75 : 0) + calidad(w),
      jitter: JITTER_DIARIO,
    });

    // Las fotos, sólo de los elegidos: la del catálogo comunitario (si es de allí) y si no la del pool.
    const diferidas = elegidos.filter((w) => w.fotoDiferida);
    const deLaComunidad = diferidas.length ? await communityWines.imagenesDe(diferidas.map((w) => w.id)) : new Map();
    const sinFoto = elegidos.filter((w) => !deLaComunidad.get(w.id) && !esImagenAceptada(w.image));
    const [delPool, calidadDelPool] = sinFoto.length
      ? await Promise.all([wineImages.getImagesFor(sinFoto), wineImages.getCalidadFor(sinFoto)])
      : [new Map(), new Map()];
    const conImagen = elegidos.map(({ fotoDiferida, confiable, ...w }) => {
      const motivo = recommendations.explicarRecomendacion(w, perfil, { semilla: semillaDelDia() + semillaDePersona(req.user.id) });
      const propia = deLaComunidad.get(w.id) || (esImagenAceptada(w.image) ? w.image : "");
      const clave = poolKey(w.name, w.winery, w.varietal);
      const image = propia || delPool.get(clave) || "";
      const aceptada = esImagenAceptada(image) ? image : "";
      // Sólo la foto del pool evaluada como buena foto de vino es confiable. La que subió una persona al
      // cargar su vino (una mano, una pared, la botella chica) no se evaluó: la ficha la muestra, la tarjeta no.
      const fotoConfiable = Boolean(aceptada) && !propia && (calidadDelPool.get(clave) ?? 0) >= FOTO_CONFIABLE_MIN;
      return { ...w, image: aceptada, fotoConfiable, motivo };
    });
    // Con foto primero (la primera tarjeta es la que más luce), manteniendo el orden del ranking.
    const data = conFotoPrimero(conImagen, DESTACADOS);
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
      const u = await User.findById(req.user.id).select("firstName avatar").lean();
      author = {
        name: (u?.firstName || "").trim() || "Alguien",
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
