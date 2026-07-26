// Ficha IA de un vino, persistida.
//
// El modelo Wine siempre tuvo `description.*`, pero nada la escribía: la ficha
// se re-pedía en CADA apertura del detalle. Acá la generamos una vez al crear el
// vino y la guardamos, usando primero el caché compartido (WineInfo) para no
// gastar cuota en botellas que otro usuario ya consultó.

const Wine = require("../models/wine.model");
const WineInfo = require("../models/wineInfo.model");
const { fold } = require("../data/argentineWines");
const { describeWine } = require("./wineAi.service");
const { isGeminiConfigured } = require("./gemini.service");

const describeKey = (name, winery) => `${fold(name)}|${fold(winery)}`;

/**
 * Genera (o reusa) la ficha del vino y la guarda en el documento.
 * Best-effort: cualquier fallo se traga, porque esto corre en segundo plano y
 * nunca debe afectar el alta del vino.
 */
const ensureDescription = async (wine) => {
  if (!wine?.name) return null;
  if (!isGeminiConfigured()) return null;

  const key = describeKey(wine.name, wine.winery);

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
            aromas: info.aromas || [],
            foodPairing: info.foodPairing || [],
            alcohol: info.alcohol ?? undefined,
            serve: info.serve || "",
            known: info.known !== false,
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
