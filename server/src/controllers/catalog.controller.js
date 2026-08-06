const catalogService = require("../services/catalog.service");
const wineReviews = require("../services/wineReviews.service");
const User = require("../models/user.model");
const { describeWine, suggestRecipe, classifyDish, PLANS } = require("../services/wineAi.service");
const wineImages = require("../services/wineImages.service");
const winePrices = require("../services/winePrices.service");
const WineInfo = require("../models/wineInfo.model");
const { describeKey } = require("../services/wineDescription.service");
const { fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");
const WineRecipe = require("../models/wineRecipe.model");
const DishPairing = require("../models/dishPairing.model");

// GET /api/catalog/search?q=...
const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ data: [], degraded: false });
    }

    const { results, degraded } = await catalogService.searchWines(q);
    // Pegamos las fotos "stock" que otros usuarios hayan subido.
    const withImages = await wineImages.enrichWithImages(results);
    return res.status(200).json({ data: withImages, degraded });
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
const featured = async (req, res, next) => {
  try {
    const data = await wineImages.enrichWithImages(catalogService.getFeatured(8));
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// GET /api/catalog/price?name=&winery=&varietal= - precio comunitario (promedio).
// La uva va en la clave: el nombre visible ya no la incluye y sin ella dos uvas
// de la misma línea compartirían precio.
const price = async (req, res, next) => {
  try {
    const data = await winePrices.getPrice(
      String(req.query.name || ""),
      String(req.query.winery || ""),
      String(req.query.varietal || "")
    );
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

// POST /api/catalog/match - busca en el catálogo el vino que corresponde a una
// lectura de etiqueta. Devuelve null si no hay una coincidencia confiable: es
// preferible no completar campos a completarlos con otra botella.
const match = async (req, res, next) => {
  try {
    const data = await catalogService.findMatch({
      winery: String(req.body.winery || ""),
      line: String(req.body.line || ""),
      name: String(req.body.name || ""),
      varietal: String(req.body.varietal || ""),
      vintage: String(req.body.vintage || ""),
    });
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
};

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
const myReviews = async (req, res, next) => {
  try {
    const data = await wineReviews.listByUser(req.user.id);
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

module.exports = { search, describe, recipe, pairing, featured, price, match, reviews, myReviews, publishReview, removeReview };
