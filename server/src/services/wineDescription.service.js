// Ficha IA de un vino, persistida.
//
// El modelo Wine siempre tuvo `description.*`, pero nada la escribía: la ficha
// se re-pedía en CADA apertura del detalle. Acá la generamos una vez al crear el
// vino y la guardamos, usando primero el caché compartido (WineInfo) para no
// gastar cuota en botellas que otro usuario ya consultó.

const Wine = require("../models/wine.model");
const WineInfo = require("../models/wineInfo.model");
const { limpiarDato } = require("../utils/promptSeguro");
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
/**
 * ── POR QUÉ LA CLAVE LLEVA VERSIÓN ──────────────────────────────────────────
 * La ficha se cachea para siempre y entre todos los usuarios, que es justo lo
 * que queremos: una botella se paga una sola vez. El costo es que cambiar el
 * prompt no cambia nada de lo que ya está guardado — los vinos viejos siguen
 * mostrando la descripción corta generada con las instrucciones anteriores,
 * y el cambio sólo se ve en botellas que nadie consultó nunca.
 *
 * Subir esta versión es la forma de decir "estas fichas ya no sirven": las
 * claves dejan de coincidir, se regeneran con el prompt nuevo y las viejas
 * quedan huérfanas en la colección (ocupan lugar, no molestan, y se pueden
 * borrar a mano por prefijo cuando sobren).
 *
 * NO la subas por retocar una coma: cada salto vuelve a pagar la generación de
 * todo el catálogo consultado hasta hoy. Se sube cuando cambia QUÉ se pide.
 *
 * v2 — el resumen pasó de 2-3 oraciones a 4-6 (región, uva, madera y boca), el
 * "cómo tomarlo" se extendió, y structure y aromas se volvieron obligatorios
 * porque dejaron de estar plegados en la ficha.
 *
 * v3 — cambió el TONO, que en una ficha que se lee entera pesa tanto como el
 * dato. Las de v2 arrancaban todas igual ("Este Malbec del Valle de Uco
 * despliega…") y con cien vinos cargados la app se leía como un catálogo. Ahora
 * la primera oración va directa y sin verbo de contraetiqueta ("Un Malbec con
 * fruta madura, madera bien puesta y bastante cuerpo"), y el resto conserva el
 * mismo detalle. La información no cambió; cambió quién parece estar hablando.
 */
const { esNombreProvisorio } = require("../data/wineValidation");

const DESCRIBE_VERSION = "v3";

const describeKey = (name, winery, varietal = "") =>
  `${DESCRIBE_VERSION}:${poolKey(limpiarDato(name, 120), limpiarDato(winery, 120), limpiarDato(varietal, 120))}`;

/**
 * Genera (o reusa) la ficha del vino y la guarda en el documento.
 * Best-effort: cualquier fallo se traga, porque esto corre en segundo plano y
 * nunca debe afectar el alta del vino.
 */
const ensureDescription = async (wine) => {
  if (!wine?.name) return null;
  // Un nombre de relleno comparte clave con otros vinos: no se siembra la caché de todos con él.
  if (esNombreProvisorio(wine)) return null;
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
