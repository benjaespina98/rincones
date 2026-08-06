// Ficha IA de un vino, persistida.
//
// El modelo Wine siempre tuvo `description.*`, pero nada la escribía: la ficha
// se re-pedía en CADA apertura del detalle. Acá la generamos una vez al crear el
// vino y la guardamos, usando primero el caché compartido (WineInfo) para no
// gastar cuota en botellas que otro usuario ya consultó.

const Wine = require("../models/wine.model");
const WineInfo = require("../models/wineInfo.model");
const { poolKey } = require("../data/wineIdentity");
const { describeWine } = require("./wineAi.service");
const { isGeminiConfigured } = require("./gemini.service");

/**
 * La clave de la ficha compartida: nombre + uva + bodega.
 *
 * Era `nombre|bodega`, sin la uva, y eso rompía dos cosas —las mismas que ya
 * habían roto en las reseñas—:
 *
 * 1. Dos vinos distintos compartían ficha. "Rutini Malbec" y "Rutini Cabernet"
 *    caían en la misma clave, así que el segundo recibía la descripción, los
 *    aromas, la estructura y el "¿sabías que?" del primero.
 * 2. El MISMO vino se cacheaba dos veces, porque el nombre cambia según de dónde
 *    venga: "Rutini" desde tu bodega y "Rutini Malbec" desde el catálogo. Se
 *    pagaba la generación dos veces y dos personas con la misma botella podían
 *    leer descripciones distintas.
 *
 * `poolKey` es la misma clave que usan las fotos, los precios y las reseñas: mete
 * la uva adentro del nombre sólo si no está ya, así las dos formas convergen.
 */
const describeKey = (name, winery, varietal = "") => poolKey(name, winery, varietal);

/**
 * Genera (o reusa) la ficha del vino y la guarda en el documento.
 * Best-effort: cualquier fallo se traga, porque esto corre en segundo plano y
 * nunca debe afectar el alta del vino.
 */
const ensureDescription = async (wine) => {
  if (!wine?.name) return null;
  if (!isGeminiConfigured()) return null;

  const key = describeKey(wine.name, wine.winery, wine.varietal);

  // 1) Caché compartida entre todos los usuarios.
  let info = null;
  try {
    const cached = await WineInfo.findOne({ key }).lean();
    if (cached?.info) info = cached.info;
  } catch {
    // Sin caché: generamos.
  }

  // 2) Generar si hizo falta, y sembrar la caché.
  if (!info) {
    info = await describeWine({
      name: wine.name,
      winery: wine.winery,
      varietal: wine.varietal,
      type: wine.type,
      region: wine.region,
      vintage: wine.vintage,
    });
    if (!info) return null;
    try {
      await WineInfo.updateOne({ key }, { $set: { key, info } }, { upsert: true });
    } catch {
      // La caché es una optimización.
    }
  }

  // 3) Persistir en el vino del usuario.
  try {
    await Wine.updateOne(
      { _id: wine._id },
      {
        $set: {
          description: {
            summary: info.summary || "",
            body: info.body || "",
            profile: info.profile || [],
            structure: info.structure || undefined,
            similarTo: info.similarTo || [],
            aromas: info.aromas || [],
            foodPairing: info.foodPairing || [],
            alcohol: info.alcohol ?? undefined,
            serve: info.serve || "",
            known: info.known !== false,
            funFact: info.funFact || "",
            generatedAt: new Date(),
          },
        },
      }
    );
  } catch {
    // El vino ya está guardado; la ficha se puede regenerar al abrirlo.
  }

  return info;
};

module.exports = { ensureDescription, describeKey };
