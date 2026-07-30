// Catálogo comunitario de vinos: crece con lo que cargan los usuarios.

const CommunityWine = require("../models/communityWine.model");
const { fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");

// Nombre + uva + bodega: el nombre visible ya no trae la uva, así que sin ella
// "Saint Felicien Malbec" y "Saint Felicien Cabernet" colapsarían en una fila.
const wineKey = (name, winery, varietal) => poolKey(name, winery, varietal);

// Nombres genéricos que no aportan (evita ensuciar el catálogo comunitario).
const isGeneric = (name) => {
  const n = fold(name);
  return !n || n.length < 3 || /^(vino|tinto|blanco|rosado|sin nombre|malbec|cabernet)$/.test(n);
};

const looksLikeImage = (v) =>
  typeof v === "string" && /^(data:image\/|https?:\/\/)/.test(v.trim());

/**
 * Suma un vino al catálogo comunitario. Best-effort, nunca lanza.
 * No pisa datos existentes salvo para completar huecos (ej: imagen que faltaba).
 */
const contribute = async (wine = {}) => {
  try {
    const key = wineKey(wine.name, wine.winery, wine.varietal);
    if (!key || isGeneric(wine.name)) return;

    const existing = await CommunityWine.findOne({ key });
    if (!existing) {
      await CommunityWine.create({
        key,
        name: String(wine.name).trim(),
        winery: String(wine.winery || "").trim(),
        region: String(wine.region || "").trim(),
        varietal: String(wine.varietal || "").trim(),
        type: wine.type || "unknown",
        image: looksLikeImage(wine.image) ? wine.image.trim() : "",
        count: 1,
      });
      return;
    }
    existing.count += 1;
    // Completamos sólo lo que estaba vacío.
    if (!existing.region && wine.region) existing.region = String(wine.region).trim();
    if (!existing.varietal && wine.varietal) existing.varietal = String(wine.varietal).trim();
    if ((existing.type === "unknown" || !existing.type) && wine.type) existing.type = wine.type;
    if (!looksLikeImage(existing.image) && looksLikeImage(wine.image)) existing.image = wine.image.trim();
    await existing.save();
  } catch {
    // El catálogo comunitario es una mejora, no un requisito del alta.
  }
};

/**
 * Busca en el catálogo comunitario. Devuelve resultados normalizados con la
 * misma forma que el resto de las fuentes (source: "comunidad").
 */
const search = async (query, limit = 12) => {
  try {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    // Regex AND: cada término debe aparecer en algún campo indexado.
    const regexes = terms.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    const conds = regexes.map((rx) => ({
      $or: [{ name: rx }, { winery: rx }, { varietal: rx }, { region: rx }],
    }));

    const docs = await CommunityWine.find({ $and: conds })
      .sort({ count: -1 })
      .limit(limit)
      .lean();

    return docs.map((d) => ({
      id: `com-${d.key}`,
      name: d.name,
      winery: d.winery || "",
      region: d.region || "",
      varietal: d.varietal || "",
      type: d.type || "unknown",
      image: d.image || "",
      vintage: "",
      rating: 0,
      barcode: "",
      source: "comunidad",
      score: d.count || 1,
    }));
  } catch {
    return [];
  }
};

module.exports = { contribute, search, wineKey };
