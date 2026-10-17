// Catálogo comunitario de vinos: crece con lo que cargan los usuarios.
//
// La regla de admisión vive acá y es lo más importante del módulo: preferimos
// tener menos vinos bien identificados que muchos con datos inventados. Ver el
// comentario largo en models/communityWine.model.js.

const CommunityWine = require("../models/communityWine.model");
const { fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");
const { nombreIgualALaBodegaEsLegitimo } = require("../data/wineValidation");

// Nombre + uva + bodega: el nombre visible ya no trae la uva, así que sin ella
// "Saint Felicien Malbec" y "Saint Felicien Cabernet" colapsarían en una fila.
const wineKey = (name, winery, varietal) => poolKey(name, winery, varietal);

// Nombres genéricos que no aportan (evita ensuciar el catálogo comunitario).
const isGeneric = (name) => {
  const n = fold(name);
  return !n || n.length < 3 || /^(vino|tinto|blanco|rosado|sin nombre|malbec|cabernet)$/.test(n);
};

const { esImagenAceptada: looksLikeImage } = require("../utils/imagenAceptada");

/** Cuántas personas distintas hacen falta para considerarlo tan bueno como el catálogo curado. */
const CONTRIBUTORS_TO_VERIFY = 2;

/**
 * ¿Esta fila tiene identidad suficiente para que la vea otra persona?
 *
 * Es el ÚNICO requisito para aparecer en la búsqueda, y son tres condiciones que
 * se pueden verificar mirando la fila —no la confianza con la que se leyó—:
 * hay nombre, hay bodega, y no son la misma palabra.
 *
 * Lo tercero es el caso "Pispi": el nombre de fantasía suele ser lo más grande
 * de la etiqueta y la bodega va chica abajo, así que el modelo lee el mismo
 * texto para los dos campos. Cuando eso pasa sabemos que uno de los dos está
 * mal pero no cuál, y una fila así no identifica ninguna botella.
 */
const identidadCompleta = (doc = {}) => {
  const nombre = fold(doc.name || "");
  const bodega = fold(doc.winery || "");
  if (!nombre || !bodega) return false;
  if (nombre !== bodega) return true;
  // Nombre = bodega: pasa sólo si algo lo respalda. El catálogo curado tiene 25
  // filas así (Norton, El Enemigo, Achaval Ferrer, Durigutti, Chandon…), y para
  // las que todavía no están, `sameNameOk` guarda que una persona lo confirmó en
  // la revisión. Sin ninguna de las dos cosas es el error "Pispi".
  return nombreIgualALaBodegaEsLegitimo(doc.name || "") || doc.sameNameOk === true;
};

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

/**
 * Recalcula los dos estados sobre el documento ya actualizado.
 *
 * ── POR QUÉ PUBLICAR YA NO ESPERA A UNA SEGUNDA PERSONA ─────────────────────
 * Antes `published` significaba "dos personas confirmaron esto", y la fila de
 * quien lo cargó primero quedaba invisible mientras tanto. La defensa estaba bien
 * pensada y puesta en el lugar equivocado: bloqueaba la EXISTENCIA en vez de la
 * AUTORIDAD. Con un solo usuario esa segunda persona no llega nunca, así que el
 * efecto real era que ningún vino cargado a mano aparecía jamás en la búsqueda
 * —ni con su foto, que es lo que la vuelve útil—.
 *
 * Ahora los dos estados dicen cosas distintas:
 *
 *   published — ¿existe para los demás? Sí, apenas la identidad alcanza para
 *               nombrar una botella. No mira la confianza de la lectura.
 *   verified  — ¿tiene autoridad? Sigue pidiendo dos personas independientes y
 *               al menos una identificación confiable, y sigue siendo lo único
 *               que rankea por encima de lo que devuelve el modelo (SOURCE_RANK
 *               en catalog.service.js: "comunidad-verificada" va arriba de
 *               gemini, "comunidad" a secas va abajo).
 *
 * O sea que una lectura floja aparece, pero nunca puede tapar un dato bueno. Que
 * es la protección que importaba.
 */
const aplicarUmbrales = (doc) => {
  const personas = doc.contributors?.length || 0;
  doc.published = identidadCompleta(doc);
  doc.verified = personas >= CONTRIBUTORS_TO_VERIFY && doc.trustedCount > 0;
};

/**
 * La misma fila, guardada con la clave de antes de que supiéramos la uva.
 *
 * ── EL BUG QUE ARREGLA ──────────────────────────────────────────────────────
 * La clave incluye el varietal, pero los campos se completan DESPUÉS: una fila
 * creada por una lectura que no leyó la uva nace con la clave sin ella, y cuando
 * más tarde otra carga completa `varietal`, la clave no se recalcula. La fila
 * queda descrita por una clave que ya no coincide con sus propios datos.
 *
 * A partir de ahí, la carga siguiente del MISMO vino calcula la clave con la uva,
 * no encuentra nada, y crea una segunda fila. Eso es lo que dejó duplicados
 * publicados en la búsqueda —"Familia Benito" y "Familia Benito Sauvignon Blanc"
 * son la misma botella— y partió el pool de fotos en dos mitades que no se ven.
 *
 * Buscarla por la clave vieja es lo que permite ADOPTARLA en vez de duplicarla.
 * Sólo si la uva no contradice: una fila que ya dice "Malbec" no es la hermana
 * de una carga que dice "Cabernet", es otro vino de la misma línea.
 */
const filaHermana = async (wine, keyActual) => {
  const uva = String(wine.varietal || "").trim();
  if (!uva) return null;

  const keyVieja = wineKey(wine.name, wine.winery, "");
  if (!keyVieja || keyVieja === keyActual) return null;

  const vieja = await CommunityWine.findOne({ key: keyVieja });
  if (!vieja) return null;
  if (vieja.varietal && fold(vieja.varietal) !== fold(uva)) return null;

  // Adoptarla es arreglarle la clave: de acá en adelante se la encuentra por
  // donde corresponde y deja de poder duplicarse.
  vieja.key = keyActual;
  return vieja;
};

/**
 * Suma un vino al catálogo comunitario. Best-effort, nunca lanza.
 * No pisa datos existentes salvo para completar huecos (ej: imagen que faltaba).
 *
 * ── QUÉ DECIDE QUÉ ──────────────────────────────────────────────────────────
 * La ADMISIÓN es estructural y no mira la confianza de la lectura: hace falta un
 * nombre que no sea genérico y una bodega. Nada más. Que el modelo haya leído la
 * etiqueta con 90 o con 55 no cambia si el vino existe, y era lo que antes dejaba
 * afuera del catálogo a cargas perfectamente buenas.
 *
 * `verdict` ya no decide si entra, sólo cuánto pesa:
 *   "trusted" → suma a `trustedCount`, que es la mitad de `verified` (la otra
 *               mitad son dos personas distintas). `verified` es lo único que
 *               rankea por encima del modelo.
 *   el resto  → entra igual, como una contribución más.
 *
 * Si la fila se publica o no lo dice `identidadCompleta`, sobre el documento ya
 * guardado. Una carga puede quedar anotada y sin publicar —nombre = bodega sin
 * confirmar— y eso NO se pierde: cuando su autor corrija la identidad, `retract`
 * la saca de la fila mala y `contribute` la suma a la buena.
 */
const contribute = async (
  wine = {},
  { userId, verdict = "unverified", origin = "scan", sameNameConfirmed = false } = {}
) => {
  try {
    const key = wineKey(wine.name, wine.winery, wine.varietal);
    if (!key || isGeneric(wine.name)) return;

    // Sin bodega no hay identidad que compartir: el nombre solo alcanza para tu
    // bodega, no para un catálogo que después consulta otra gente.
    if (!String(wine.winery || "").trim()) return;

    const confiable = verdict === "trusted";
    const existing = (await CommunityWine.findOne({ key })) || (await filaHermana(wine, key));

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
        sameNameOk: sameNameConfirmed === true,
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

    // La confirmación de "se llama igual que la bodega" sólo suma: una vez que
    // alguien lo confirmó, que la siguiente carga no lo repita no lo desmiente.
    if (sameNameConfirmed === true) existing.sameNameOk = true;

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
 * Sólo lo publicado: una fila sin identidad completa no es un resultado, es una
 * anotación interna. Y las verificadas se marcan con su propia `source` para que
 * el ranking pueda ponerlas donde corresponde (ver SOURCE_RANK en
 * catalog.service.js).
 *
 * El corte por `limit` prioriza las filas CON FOTO. No es un detalle estético:
 * un resultado con foto es el que se puede reconocer de un vistazo, y si la fila
 * que la tiene se cae por el límite, la foto no aparece en ningún lado aunque
 * esté guardada. Se piden el doble de filas y se ordena acá porque "tiene foto"
 * es un string no vacío, no algo que el índice pueda ordenar.
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

    const encontrados = await CommunityWine.find({ published: true, $and: conds })
      .sort({ count: -1 })
      .limit(limit * 2)
      .lean();

    const docs = encontrados
      .sort((a, b) => {
        const fotoA = looksLikeImage(a.image);
        const fotoB = looksLikeImage(b.image);
        if (fotoA !== fotoB) return fotoA ? -1 : 1;
        return (b.count || 0) - (a.count || 0);
      })
      .slice(0, limit);

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
  identidadCompleta,
  CONTRIBUTORS_TO_VERIFY,
};
