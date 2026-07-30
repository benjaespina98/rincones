const catalogService = require("../services/catalog.service");
const wineReviews = require("../services/wineReviews.service");
const User = require("../models/user.model");
const { describeWine } = require("../services/wineAi.service");
const wineImages = require("../services/wineImages.service");
const winePrices = require("../services/winePrices.service");
const WineInfo = require("../models/wineInfo.model");

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

const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// POST /api/catalog/describe { name, winery, varietal, type, region, vintage }
// Devuelve la ficha (estilo Vivino) del vino, generada por Gemini y cacheada.
const describe = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }
    const winery = String(req.body.winery || "").trim();
    const key = `${fold(name)}|${fold(winery)}`;

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
      varietal: String(req.body.varietal || "").trim(),
      type: String(req.body.type || "").trim(),
      region: String(req.body.region || "").trim(),
      vintage: req.body.vintage,
    });

    if (!info) {
      return res.status(503).json({ message: "No pudimos generar la descripción ahora" });
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
      req.user.id
    );
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
    const { name, winery, rating, text } = req.body;
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
    });
    if (!ok) return res.status(404).json({ message: "No tenías una reseña de este vino" });
    return res.status(200).json({ message: "Reseña eliminada" });
  } catch (error) {
    return next(error);
  }
};

module.exports = { search, describe, featured, price, match, reviews, publishReview, removeReview };
