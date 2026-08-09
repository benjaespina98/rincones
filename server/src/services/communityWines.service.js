// Catálogo comunitario de vinos: crece con lo que cargan los usuarios.
//
// La regla de admisión vive acá y es lo más importante del módulo: preferimos
// tener menos vinos bien identificados que muchos con datos inventados. Ver el
// comentario largo en models/communityWine.model.js.

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

/** Cuántas personas distintas hacen falta para publicar algo que no vino confiable. */
const CONTRIBUTORS_TO_PUBLISH = 2;
/** Y cuántas para considerarlo tan bueno como el catálogo curado. */
const CONTRIBUTORS_TO_VERIFY = 2;

/**
 * ¿Esta carga confirma lo que ya teníamos, o lo contradice?
 *
 * La clave (nombre + uva + bodega) ya garantiza que hablamos del mismo vino, así
 * que lo único que puede discrepar son los campos de contexto. Si dos personas
 * dicen regiones distintas del mismo vino, alguna se equivocó: la carga entra
 * igual —no vamos a descartar a nadie— pero NO cuenta como confirmación, porque
 * confirmar es coincidir.
 */
const esConsistente = (existente, entrante) => {
  const chocan = (a, b) => {
    const x = fold(a || "");
    const y = fold(b || "");
    return Boolean(x && y && x !== y);
  };
  if (chocan(existente.region, entrante.region)) return false;
  const tipoViejo = existente.type && existente.type !== "unknown" ? existente.type : "";
  const tipoNuevo = entrante.type && entrante.type !== "unknown" ? entrante.type : "";
  return !chocan(tipoViejo, tipoNuevo);
};

/** Recalcula los dos umbrales sobre el documento ya actualizado. */
const aplicarUmbrales = (doc) => {
  const personas = doc.contributors?.length || 0;
  doc.published = doc.trustedCount > 0 || personas >= CONTRIBUTORS_TO_PUBLISH;
  doc.verified = personas >= CONTRIBUTORS_TO_VERIFY && doc.trustedCount > 0;
};

/**
 * Suma un vino al catálogo comunitario. Best-effort, nunca lanza.
 * No pisa datos existentes salvo para completar huecos (ej: imagen que faltaba).
 *
 * `verdict` decide todo (ver data/wineValidation.js):
 *   "trusted"    → publica en el acto.
 *   "unverified" → deja la fila creada pero SIN publicar, esperando que otra
 *                  persona llegue a lo mismo por su cuenta.
 *   "doubtful"   → no se toca el catálogo. Ese vino vive sólo en la bodega de
 *                  quien lo cargó, que es exactamente donde tiene que estar
 *                  mientras no sepamos qué es.
 */
const contribute = async (wine = {}, { userId, verdict = "unverified", origin = "scan" } = {}) => {
  try {
    if (verdict === "doubtful") return;

    const key = wineKey(wine.name, wine.winery, wine.varietal);
    if (!key || isGeneric(wine.name)) return;

    // Sin bodega no hay identidad que compartir: el nombre solo alcanza para tu
    // bodega, no para un catálogo que después consulta otra gente.
    if (!String(wine.winery || "").trim()) return;

    const confiable = verdict === "trusted";
    const existing = await CommunityWine.findOne({ key });

    if (!existing) {
      const doc = new CommunityWine({
        key,
        name: String(wine.name).trim(),
        winery: String(wine.winery || "").trim(),
        region: String(wine.region || "").trim(),
        varietal: String(wine.varietal || "").trim(),
        type: wine.type || "unknown",
        image: looksLikeImage(wine.image) ? wine.image.trim() : "",
        count: 1,
        contributors: userId ? [userId] : [],
        trustedCount: confiable ? 1 : 0,
        origin,
      });
      aplicarUmbrales(doc);
      await doc.save();
      return;
    }

    existing.count += 1;

    // Una persona nueva sólo cuenta si además coincide con lo que ya había.
    const yaEstaba = userId
      ? existing.contributors.some((c) => String(c) === String(userId))
      : true;
    const coincide = esConsistente(existing, wine);

    if (userId && !yaEstaba && coincide) existing.contributors.push(userId);
    // Lo confiable suma aunque sea de alguien que ya había cargado: es una
    // lectura buena y eleva la fila, pero no inventa una segunda persona.
    if (confiable && coincide) existing.trustedCount += 1;

    if (existing.origin !== origin) existing.origin = "mixed";

    // Completamos sólo lo que estaba vacío.
    if (!existing.region && wine.region) existing.region = String(wine.region).trim();
    if (!existing.varietal && wine.varietal) existing.varietal = String(wine.varietal).trim();
    if ((existing.type === "unknown" || !existing.type) && wine.type) existing.type = wine.type;
    if (!looksLikeImage(existing.image) && looksLikeImage(wine.image)) existing.image = wine.image.trim();

    aplicarUmbrales(existing);
    await existing.save();
  } catch {
    // El catálogo comunitario es una mejora, no un requisito del alta.
  }
};

/**
 * Saca la contribución de una persona a un vino. Best-effort, nunca lanza.
 *
 * Es la mitad que faltaba de "las correcciones se propagan": cuando alguien
 * arregla el nombre o la bodega de un vino suyo, la identidad VIEJA deja de
 * tener a esa persona detrás. Sin esto, la fila equivocada se quedaba publicada
 * para siempre sostenida por una carga que su propio autor ya desmintió — la
 * base pública sólo aprendía del error y nunca de la corrección.
 *
 * Si al sacarla la fila se queda sin nadie, se borra. Si le queda gente, se
 * recalculan los umbrales: puede pasar de verificada a publicada, o de publicada
 * a invisible, que es exactamente lo que corresponde.
 */
const retract = async (wine = {}, { userId, wasTrusted = false } = {}) => {
  try {
    const key = wineKey(wine.name, wine.winery, wine.varietal);
    if (!key) return;

    const existing = await CommunityWine.findOne({ key });
    if (!existing) return;

    existing.count = Math.max(0, existing.count - 1);
    if (wasTrusted) existing.trustedCount = Math.max(0, existing.trustedCount - 1);
    if (userId) {
      existing.contributors = existing.contributors.filter(
        (c) => String(c) !== String(userId)
      );
    }

    // Nadie la sostiene: la fila era de esa sola persona y se equivocó.
    if (existing.contributors.length === 0 && existing.trustedCount === 0) {
      await CommunityWine.deleteOne({ _id: existing._id });
      return;
    }

    aplicarUmbrales(existing);
    await existing.save();
  } catch {
    // Igual que contribute: nunca puede romper la edición del vino.
  }
};

/**
 * Busca en el catálogo comunitario. Devuelve resultados normalizados con la
 * misma forma que el resto de las fuentes.
 *
 * Sólo lo publicado: una fila que espera confirmación no es un resultado, es una
 * anotación interna. Y las verificadas se marcan con su propia `source` para que
 * el ranking pueda ponerlas donde corresponde (ver SOURCE_RANK en
 * catalog.service.js).
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

    const docs = await CommunityWine.find({ published: true, $and: conds })
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
      source: d.verified ? "comunidad-verificada" : "comunidad",
      score: d.count || 1,
    }));
  } catch {
    return [];
  }
};

module.exports = {
  contribute,
  retract,
  search,
  wineKey,
  CONTRIBUTORS_TO_PUBLISH,
  CONTRIBUTORS_TO_VERIFY,
};
