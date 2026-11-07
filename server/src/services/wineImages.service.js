// Pool compartido de fotos de vinos ("stock").
// Ver models/wineImage.model.js para el concepto.

const WineImage = require("../models/wineImage.model");
const { poolKey } = require("../data/wineIdentity");
const wineImageQuality = require("./wineImageQuality.service");
const imageStorage = require("./imageStorage.service");

// Cuánto tiene que superar una foto nueva a la puesta para desplazarla. Sin
// margen, dos fotos parecidas puntuadas por separado (y Gemini no es
// determinista al 100%) podrían turnarse en el lugar con cada carga. Con
// margen, sólo una foto CLARAMENTE mejor gana.
const REPLACE_MARGIN = 8;

// Clave del vino: nombre + uva + bodega. Los tres, para no mezclar homónimos ni
// dos uvas de la misma línea ("Saint Felicien Malbec" no es "Saint Felicien
// Cabernet"). Definida una sola vez en data/wineIdentity.js.
const wineKey = (name, winery, varietal) => poolKey(name, winery, varietal);

// Sólo guardamos fotos "de verdad" (data URL o http), no cadenas vacías.
const { esImagenAceptada: looksLikeImage } = require("../utils/imagenAceptada");

/**
 * Aporta una foto al pool para un vino.
 *
 * ── EL GATE: QUÉ NI SIQUIERA ENTRA ──────────────────────────────────────────
 * Si Gemini está configurado y puede leer la imagen, una foto que reconoce con
 * seguridad como "no es un vino" no entra al pool público bajo ningún
 * concepto — ni crea la entrada ni reemplaza una existente, ni siquiera si la
 * sube el dueño de la foto actual. El pool es la cara pública del vino para
 * cualquiera que lo busque, no un álbum personal. Sin Gemini configurado, o si
 * la imagen no es un data URL (por ejemplo, un enlace pegado a mano), el gate
 * no puede evaluar y no bloquea: mismo comportamiento que antes de que
 * existiera este puntaje.
 *
 * ── QUIÉN PUEDE PISAR LA FOTO YA PUESTA ─────────────────────────────────────
 * Dos caminos:
 *   1. El autor de la foto actual siempre puede reemplazar la suya — si salió
 *      movida o con el flash en la etiqueta, no tiene que quedar así para
 *      siempre ni pedirle permiso a nadie.
 *   2. Cualquier otra persona puede reemplazarla si Gemini puntuó SU foto
 *      claramente mejor que la puesta (`REPLACE_MARGIN`). Así el pool converge
 *      con el uso hacia la mejor foto disponible, en vez de quedarse
 *      congelado en la primera que llegó. Una foto vieja sin puntaje (de
 *      antes de este cambio) cuenta como piso, así cualquier foto nueva bien
 *      puntuada la puede desplazar.
 *
 * Best-effort: nunca lanza, para no romper el alta ni la edición del vino.
 */
const contribute = async ({ name, winery, varietal, image, userId }) => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key || !looksLikeImage(image)) return;
    // Al pool compartido (lo ve todo el mundo) sólo entra una foto ya re-alojada
    // en Cloudinary o una subida directa: una URL de un tercero serviría de
    // pixel de rastreo a cada usuario que abra el vino.
    if (!/^data:image\//i.test(String(image).trim()) && !imageStorage.esUrlPropia(image)) return;

    const limpia = image.trim();
    const score = await wineImageQuality.scorePhoto(limpia);
    if (score && score.isWinePhoto === false) return;

    const existente = await WineImage.findOne({ key })
      .select("contributedBy qualityScore")
      .lean();

    if (existente) {
      const esDueño = Boolean(userId) && String(existente.contributedBy || "") === String(userId);
      const pisoActual =
        typeof existente.qualityScore === "number" ? existente.qualityScore : -Infinity;
      const claramenteMejor = Boolean(score) && score.quality >= pisoActual + REPLACE_MARGIN;

      if (!esDueño && !claramenteMejor) return;

      const set = { image: limpia };
      if (score) {
        set.qualityScore = score.quality;
        // Si quien reemplaza no es el dueño actual, es porque su foto ganó
        // por calidad: la atribución pasa a ser suya.
        if (!esDueño) set.contributedBy = userId;
      }
      await WineImage.updateOne({ key }, { $set: set });
      return;
    }

    const nuevo = {
      key,
      image: limpia,
      contributedBy: userId,
      name: String(name || "").trim(),
      winery: String(winery || "").trim(),
    };
    if (score) nuevo.qualityScore = score.quality;

    await WineImage.updateOne({ key }, { $setOnInsert: nuevo }, { upsert: true });
  } catch {
    // El pool es una mejora, no un requisito del alta.
  }
};

/**
 * Devuelve la foto del pool para un vino, o "" si no hay. Nunca lanza.
 */
const getImage = async (name, winery, varietal) => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key) return "";
    const doc = await WineImage.findOne({ key }).select("image").lean();
    return doc?.image || "";
  } catch {
    return "";
  }
};

/**
 * El estado del pool para una lista de vinos, en un solo viaje a la base.
 *
 * Para el navegador del catálogo (panel de admin): necesita saber, de una
 * pasada por hasta el catálogo entero, cuáles YA tienen foto puesta —para
 * filtrar "con foto" / "sin foto"— sin pedir una por una (eso sería un
 * `findOne` por fila, y el catálogo argentino tiene varios cientos).
 * Devuelve un Map clave→imagen; lo que no está en el pool, simplemente no
 * aparece en el Map.
 */
const getImagesFor = async (wines = []) => {
  const keys = [...new Set(wines.map((w) => wineKey(w.name, w.winery, w.varietal)).filter(Boolean))];
  if (keys.length === 0) return new Map();
  try {
    const docs = await WineImage.find({ key: { $in: keys } }).select("key image").lean();
    return new Map(docs.map((d) => [d.key, d.image]));
  } catch {
    return new Map();
  }
};

/**
 * El puntaje de calidad (0-100) de las fotos del pool, por clave. Sólo trae las que tienen uno: las anteriores a
 * que existiera el puntaje no se evaluaron, y de esas no se sabe si son una botella o una mano. Nunca lanza.
 */
const getCalidadFor = async (wines = []) => {
  const keys = [...new Set(wines.map((w) => wineKey(w.name, w.winery, w.varietal)).filter(Boolean))];
  if (keys.length === 0) return new Map();
  try {
    const docs = await WineImage.find({ key: { $in: keys }, qualityScore: { $type: "number" } })
      .select("key qualityScore")
      .lean();
    return new Map(docs.map((d) => [d.key, d.qualityScore]));
  } catch {
    return new Map();
  }
};

/**
 * Qué vinos de una lista tienen foto en el pool compartido, SIN traer las fotos (son data URL y
 * pesan). Devuelve el conjunto de claves (`poolKey`) que sí tienen. Sirve para saber, entre
 * cientos de candidatos, cuáles lucirían con foto, y recién después pedir la imagen de los pocos
 * elegidos con `getImagesFor`. Nunca lanza.
 */
const keysConFoto = async (wines = []) => {
  const keys = [...new Set(wines.map((w) => wineKey(w.name, w.winery, w.varietal)).filter(Boolean))];
  if (keys.length === 0) return new Set();
  try {
    const docs = await WineImage.find({ key: { $in: keys } }).select("key").lean();
    return new Set(docs.map((d) => d.key));
  } catch {
    return new Set();
  }
};

/**
 * Enriquece una lista de resultados de búsqueda: a los que no tienen imagen les
 * pega la del pool si existe. Una sola consulta para toda la lista.
 */
const enrichWithImages = async (wines = []) => {
  const need = wines.filter(
    (w) => w && !looksLikeImage(w.image) && wineKey(w.name, w.winery, w.varietal)
  );
  if (need.length === 0) return wines;

  const keys = [...new Set(need.map((w) => wineKey(w.name, w.winery, w.varietal)))];
  let byKey = new Map();
  try {
    const docs = await WineImage.find({ key: { $in: keys } }).select("key image").lean();
    byKey = new Map(docs.map((d) => [d.key, d.image]));
  } catch {
    return wines;
  }

  return wines.map((w) => {
    if (looksLikeImage(w.image)) return w;
    const img = byKey.get(wineKey(w.name, w.winery, w.varietal));
    return img ? { ...w, image: img, imageSource: "community" } : w;
  });
};

/**
 * Fija la foto del pool para un vino, curada a mano por un admin.
 *
 * ── EN QUÉ SE DIFERENCIA DE `contribute` ────────────────────────────────────
 * `contribute` es un aporte espontáneo: sólo pisa la foto puesta si es del
 * mismo dueño o si gana por calidad con margen (`REPLACE_MARGIN`), y nunca
 * lanza porque el pool es una mejora sobre un alta que no puede romperse por
 * esto. Acá es al revés en las dos cosas:
 *
 *   - Pisa sin condición: es curación deliberada ("elegí esta foto para este
 *     vino"), no una convivencia entre aportes de usuarios distintos.
 *   - SÍ lanza si la imagen no es válida o si Gemini la reconoce con
 *     seguridad como "no es una foto de vino" — el panel necesita ese motivo
 *     para mostrárselo al admin, en vez de fallar en silencio como hace un
 *     aporte cualquiera.
 *
 * El gate de "no es una foto de vino" se mantiene: un admin apurado pegando
 * la URL equivocada no debería poder ensuciar la cara pública de un vino
 * distinto más fácil que cualquier otro usuario.
 */
const adminSet = async ({ name, winery, varietal, image, userId }) => {
  const key = wineKey(name, winery, varietal);
  if (!key) throw new Error("Faltan datos del vino (nombre, bodega o uva) para identificarlo");

  const limpia = String(image || "").trim();
  if (!looksLikeImage(limpia)) throw new Error("La imagen no es válida");

  const score = await wineImageQuality.scorePhoto(limpia);
  if (score && score.isWinePhoto === false) {
    throw new Error("No se reconoce esto como una foto de vino");
  }

  const set = {
    image: limpia,
    contributedBy: userId,
    name: String(name || "").trim(),
    winery: String(winery || "").trim(),
  };
  if (score) set.qualityScore = score.quality;

  // `findOneAndUpdate` (no `updateOne`) porque el que llama necesita el _id
  // real del documento — por ejemplo para el registro de auditoría, que
  // guarda `entityId` como ObjectId y no puede usar la clave-string del pool.
  const doc = await WineImage.findOneAndUpdate(
    { key },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).select("_id");
  return { id: doc._id, key, qualityScore: set.qualityScore ?? null };
};

module.exports = { contribute, adminSet, getImage, getImagesFor, getCalidadFor, keysConFoto, enrichWithImages, wineKey };
