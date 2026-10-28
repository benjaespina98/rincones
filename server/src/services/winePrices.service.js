// Precio comunitario de vinos: agrega lo que pagó la gente y devuelve promedio.
//
// Una muestra por persona (ver winePrice.model.js): aportar dos veces es
// corregir tu precio, no sumar un voto. Todo lo de acá es best-effort y nunca
// lanza —el promedio es una mejora de la ficha, no un requisito para guardar un
// vino—, así que un fallo del pool jamás rompe una alta ni una edición.

const WinePrice = require("../models/winePrice.model");
const { poolKey } = require("../data/wineIdentity");

// Nombre + uva + bodega: dos uvas de la misma línea no comparten precio.
const wineKey = (name, winery, varietal) => poolKey(name, winery, varietal);

/**
 * Recalcula los agregados desde las muestras.
 *
 * Es la única función que escribe `sum/count/min/max`: mientras nadie los toque
 * por su cuenta, no pueden desincronizarse de la lista que los origina.
 */
const recalcular = (doc) => {
  const precios = doc.samples.map((s) => Number(s.price)).filter((p) => Number.isFinite(p) && p > 0);
  doc.sum = precios.reduce((a, b) => a + b, 0);
  doc.count = precios.length;
  doc.min = precios.length ? Math.min(...precios) : null;
  doc.max = precios.length ? Math.max(...precios) : null;
  return doc;
};

/**
 * Registra —o corrige— lo que UNA persona pagó por un vino.
 *
 * Sin `userId` no se aporta nada. Antes se sumaba igual, y ése era justamente el
 * agujero: un aporte anónimo no se puede corregir ni retirar después, así que se
 * quedaba en el promedio para siempre. Preferimos un promedio con una muestra
 * menos que uno que no se puede desarmar.
 */
const contribute = async ({ name, winery, varietal, price, currency = "ARS", userId }) => {
  try {
    const key = wineKey(name, winery, varietal);
    const value = Number(price);
    if (!key || !userId || !Number.isFinite(value) || value <= 0) return;

    const doc = (await WinePrice.findOne({ key })) || new WinePrice({
      key,
      name: String(name || "").trim(),
      winery: String(winery || "").trim(),
      currency,
    });

    const mia = doc.samples.find((s) => String(s.user) === String(userId));
    if (mia) {
      // Mismo precio que ya tenías cargado: no hay nada que actualizar y
      // reescribir el documento sólo movería la fecha.
      if (Number(mia.price) === value) return;
      mia.price = value;
      mia.currency = currency;
      mia.at = new Date();
    } else {
      doc.samples.push({ user: userId, price: value, currency, at: new Date() });
    }

    recalcular(doc);
    await doc.save();
  } catch {
    // El precio comunitario es una mejora, no un requisito.
  }
};

/**
 * Saca del pool el precio de una persona.
 *
 * Corre cuando el vino se borra, cuando se le vacía el precio y cuando cambia la
 * identidad (ahí el aporte se muda: se retira de la clave vieja y se aporta a la
 * nueva). Sin muestras el documento se elimina: un pool en cero no es un
 * promedio de cero, es la ausencia de datos, y dejar el documento vacío haría
 * que `getPrice` tuviera que distinguir dos formas de "no hay".
 */
const retract = async ({ name, winery, varietal, userId }) => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key || !userId) return;

    const doc = await WinePrice.findOne({ key });
    if (!doc) return;

    const antes = doc.samples.length;
    doc.samples = doc.samples.filter((s) => String(s.user) !== String(userId));
    if (doc.samples.length === antes) return;

    if (doc.samples.length === 0) {
      await WinePrice.deleteOne({ _id: doc._id });
      return;
    }
    recalcular(doc);
    await doc.save();
  } catch {
    // Igual que contribute: nunca puede romper el borrado de un vino.
  }
};

/**
 * Devuelve { avg, count, min, max, currency } o null si no hay datos.
 *
 * `excludeUserId` saca tu propia muestra de la cuenta, y es lo que hace honesto
 * al bloque "La comunidad" de la ficha: ahí el número tiene que ser lo que paga
 * el RESTO. Sin esto, un vino que sólo cargaste vos mostraba tu precio dos veces
 * —el chip de arriba y el "promedio de 1 persona" abajo— como si el segundo
 * confirmara al primero. Quien lo pide sin excluir a nadie (el catálogo, donde
 * el vino no es tuyo) sigue viendo el pool entero.
 */
const getPrice = async (name, winery, varietal, excludeUserId = "") => {
  try {
    const key = wineKey(name, winery, varietal);
    if (!key) return null;
    const doc = await WinePrice.findOne({ key }).lean();
    if (!doc) return null;

    const precios = (doc.samples || [])
      .filter((s) => !excludeUserId || String(s.user) !== String(excludeUserId))
      .map((s) => Number(s.price))
      .filter((p) => Number.isFinite(p) && p > 0);

    if (precios.length === 0) return null;
    return {
      avg: Math.round(precios.reduce((a, b) => a + b, 0) / precios.length),
      count: precios.length,
      min: Math.min(...precios),
      max: Math.max(...precios),
      currency: doc.currency || "ARS",
    };
  } catch {
    return null;
  }
};

/**
 * Saca a una persona de TODOS los precios del pool (baja de cuenta). Antes se
 * borraba con `{ user }` de primer nivel, un campo que no existe: el userId
 * vive dentro de `samples`, así que no se borraba nada.
 */
const retractAllFromUser = async (userId) => {
  if (!userId) return;
  const docs = await WinePrice.find({ "samples.user": userId });
  for (const doc of docs) {
    doc.samples = doc.samples.filter((s) => String(s.user) !== String(userId));
    if (doc.samples.length === 0) {
      await WinePrice.deleteOne({ _id: doc._id });
      continue;
    }
    recalcular(doc);
    await doc.save();
  }
};

module.exports = { contribute, retract, retractAllFromUser, getPrice, wineKey, recalcular };
