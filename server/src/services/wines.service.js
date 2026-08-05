const mongoose = require("mongoose");
const Wine = require("../models/wine.model");
const { getCellarStatus } = require("./cellar.service");
const WineMoment = require("../models/wineMoment.model");
const User = require("../models/user.model");
const ChangeLog = require("../models/changeLog.model");
const wineImages = require("./wineImages.service");
const imageStorage = require("./imageStorage.service");
const winePrices = require("./winePrices.service");
const communityWines = require("./communityWines.service");
const { isCuratedWine } = require("./catalog.service");
const { identityKey } = require("../data/wineIdentity");
const { buildStockStages, reconcileLots, availableFromLots } = require("../utils/lots");

const logChange = async (actorUser, action, entityId, before, after) => {
  try {
    await ChangeLog.create({
      entityType: "wine",
      entityId,
      action,
      actor: { userId: actorUser._id, email: actorUser.email, role: actorUser.role },
      before,
      after,
    });
  } catch {
    // la auditoría nunca debe romper la operación principal
  }
};

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseQuantity = (value, fallback = 1) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toWineStatus = ({ tasted, quantity, status }) => {
  if (typeof status === "string" && status.trim()) return status.trim();
  if (Number(quantity) <= 0) return tasted ? "archived" : "stock";
  return tasted ? "tasted" : "stock";
};

async function listWines(userId) {
  return Wine.find({ userId }).sort({ createdAt: -1 }).select("-rawText");
}

/**
 * Busca en la bodega del usuario.
 *
 * Cada PALABRA tiene que aparecer en algún campo, no la frase entera en uno
 * solo. Con el nombre visible ya sin la uva ("Saint Felicien", varietal
 * "Malbec"), buscar la frase completa contra un único campo no encontraba nada
 * justo para la consulta más natural: "saint felicien malbec".
 */
async function searchWines(userId, query) {
  const terms = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const campos = (regex) => [
    { name: regex },
    { line: regex },
    { winery: regex },
    { region: regex },
    { varietal: regex },
    { notes: regex },
  ];

  return Wine.find({
    userId,
    $and: terms.map((t) => ({ $or: campos(new RegExp(escapeRegex(t), "i")) })),
  })
    .sort({ createdAt: -1 })
    .select("-rawText");
}

async function getStatsSummary(userId) {
  const wines = await Wine.find({ userId });

  const avgRating = wines.length > 0 ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1) : 0;

  return {
    totalWines: wines.length,
    tastedWines: wines.filter((w) => w.tasted).length,
    favoriteWines: wines.filter((w) => w.favorite).length,
    stockWines: wines.filter((w) => Number(w.quantity) > 0).length,
    averageRating: parseFloat(avgRating),
    byRating: {
      5: wines.filter((w) => w.rating === 5).length,
      4: wines.filter((w) => w.rating === 4).length,
      3: wines.filter((w) => w.rating === 3).length,
      2: wines.filter((w) => w.rating === 2).length,
      1: wines.filter((w) => w.rating === 1).length,
    },
  };
}

async function getWineById(userId, id) {
  return Wine.findOne({ _id: id, userId });
}

/**
 * Busca en la bodega del usuario un vino que sea ESTE mismo vino.
 *
 * Una cava se administra durante años: volvés a comprar lo que te gustó, y a
 * veces lo cargás escaneando otra vez la etiqueta. Sin esto, cada compra creaba
 * una fila nueva y a los dos años la bodega tenía el mismo Malbec cinco veces,
 * con el rating y las notas repartidas entre las copias.
 *
 * La cosecha SÍ distingue: un 2019 y un 2021 de la misma etiqueta son botellas
 * distintas para quien colecciona, y mezclarlas perdería información. Un vino
 * sin cosecha cargada matchea con otro sin cosecha, no con cualquiera.
 */
async function findSameWine(userId, { name, winery, line, varietal, vintage }) {
  const target = identityKey({ name, winery, line, varietal });
  if (!target.core) return null;

  const year = vintage ? parseInt(vintage) : null;
  const candidatos = await Wine.find({ userId }).select("name winery line varietal vintage quantity");

  return (
    candidatos.find((w) => {
      const k = identityKey(w);
      if (k.core !== target.core) return false;
      if (k.varietal !== target.varietal) return false;
      if (k.wineryToken !== target.wineryToken) return false;
      return (w.vintage || null) === year;
    }) || null
  );
}

async function createWine(userId, payload) {
  const {
    name,
    winery,
    line,
    vintage,
    region,
    varietal,
    notes,
    image,
    rawText,
    rating,
    tasted,
    favorite,
    quantity,
    status,
    type,
    lastConsumedAt,
    consumptionCount,
    cellarLocation,
    drinkFrom,
    drinkUntil,
    price,
    currency,
    store,
    purchasedAt,
  } = payload;

  // ¿Ya lo tenés? Entonces esto es una reposición, no un vino nuevo: se suman
  // botellas y se conserva TODO el historial (rating, notas, momentos, la fecha
  // de ingreso a la cava). Vale igual para un vino que se había terminado: la
  // fila sigue ahí con quantity 0 y vuelve a stock sin perder lo vivido.
  const yaLoTengo = await findSameWine(userId, { name, winery, line, varietal, vintage });
  if (yaLoTengo) {
    const suman = Math.max(1, parseQuantity(quantity, 1));
    // Las botellas que entran hoy son un LOTE nuevo, con la fecha de hoy: es la
    // diferencia entre "tengo 8 desde 2019" y "3 de 2019 y 5 de este mes", que
    // es lo que uno realmente tiene. `createdAt` se respeta a propósito —la
    // fecha en que el vino entró a tu cava no se mueve nunca— y el lote más
    // viejo con stock es el que manda para el "en cava hace X".
    //
    // Todo en un solo update para que la suma la haga Mongo: cargar el mismo
    // vino dos veces seguidas desde el teléfono no puede perder botellas.
    const full = await Wine.findOneAndUpdate(
      { _id: yaLoTengo._id, userId },
      [...buildStockStages("restock", { $literal: suman }), { $set: { restockedAt: "$$NOW" } }],
      { returnDocument: "after", updatePipeline: true }
    );
    return { wine: full, merged: true, added: suman };
  }

  // Foto: si el usuario trae una, la usamos (y la aportamos al pool luego). Si
  // no, intentamos completar con la foto "stock" que otro haya subido del mismo
  // vino, para que la bodega no quede con placeholder cuando ya existe imagen.
  const rawProvided = wineImages.wineKey(name, winery, varietal) && /^(data:image\/|https?:\/\/)/.test(String(image || "").trim())
    ? String(image).trim()
    : "";
  // Subimos a Cloudinary (si está configurado) y guardamos la URL liviana; si no,
  // queda el base64 tal cual. Así el vino y el pool comparten la misma referencia.
  const providedImage = rawProvided ? await imageStorage.store(rawProvided) : "";
  const resolvedImage = providedImage || (await wineImages.getImage(name, winery, varietal));

  const wine = new Wine({
    userId,
    name: String(name || "").trim(),
    winery: winery?.trim() || "",
    line: line?.trim() || "",
    vintage: vintage ? parseInt(vintage) : null,
    region: region?.trim() || "",
    varietal: varietal?.trim() || "",
    notes: notes?.trim() || "",
    image: resolvedImage,
    imageSource: providedImage ? undefined : (resolvedImage ? "community" : undefined),
    rawText: rawText || "",
    type: type || "unknown",
    rating: rating ? parseInt(rating) : 0,
    tasted: tasted === true,
    favorite: favorite === true,
    // El lote inicial (estas botellas, con la fecha de alta) lo arma el hook
    // `pre("validate")` del modelo, que es el que sostiene la invariante
    // quantity === suma de los `remaining` en todo camino de escritura.
    quantity: parseQuantity(quantity, 1),
    status: toWineStatus({ tasted: tasted === true, quantity: parseQuantity(quantity, 1), status }),
    lastConsumedAt: lastConsumedAt ? new Date(lastConsumedAt) : undefined,
    consumptionCount: parseQuantity(consumptionCount, 0),
    cellar: {
      location: cellarLocation?.trim() || undefined,
      drinkFrom: drinkFrom ? parseInt(drinkFrom) : undefined,
      drinkUntil: drinkUntil ? parseInt(drinkUntil) : undefined,
    },
    purchase: {
      price: price !== undefined && price !== "" ? parseFloat(price) : undefined,
      currency: currency || "ARS",
      store: store?.trim() || undefined,
      purchasedAt: purchasedAt ? new Date(purchasedAt) : undefined,
    },
  });

  const savedWine = await wine.save();

  // Si el usuario aportó una foto propia, la sumamos al pool compartido para
  // que aparezca cuando otro busque/cargue el mismo vino.
  if (providedImage) {
    await wineImages.contribute({ name, winery, varietal, image: providedImage, userId });
  }

  // Si registró lo que pagó, alimenta el precio comunitario (promedio).
  if (savedWine.purchase?.price > 0) {
    await winePrices.contribute({
      name, winery, varietal,
      price: savedWine.purchase.price,
      currency: savedWine.purchase.currency,
    });
  }

  // La identidad del vino alimenta el catálogo comunitario (búsqueda de todos),
  // salvo que ya esté en el catálogo curado: ahí evitamos el gemelo duplicado.
  if (!isCuratedWine(savedWine)) {
    await communityWines.contribute({
      name: savedWine.name,
      winery: savedWine.winery,
      region: savedWine.region,
      varietal: savedWine.varietal,
      type: savedWine.type,
      image: resolvedImage,
    });
  }

  // Ficha IA en segundo plano: el alta es el camino crítico en mobile y no debe
  // esperar a Gemini. Si falla, la ficha se genera al abrir el vino.
  {
    // require diferido: wineDescription -> wineAi -> gemini, y no queremos
    // sumar ese árbol al arranque del módulo.
    const { ensureDescription } = require("./wineDescription.service");
    void ensureDescription(savedWine).catch(() => {});
  }

  const user = await User.findById(userId);
  user.stats.winesCount = (user.stats.winesCount || 0) + 1;
  if (tasted) user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
  await user.save();

  await logChange(user, "create", savedWine._id, null, { name: savedWine.name, winery: savedWine.winery });

  // Misma forma que el camino de reposición, para que el llamador no tenga que
  // adivinar cuál de los dos ocurrió.
  return { wine: savedWine, merged: false, added: savedWine.quantity };
}

async function updateWine(userId, id, payload) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const beforeSnapshot = { name: wine.name, winery: wine.winery };

  const {
    name,
    winery,
    line,
    vintage,
    region,
    varietal,
    notes,
    rating,
    tasted,
    favorite,
    quantity,
    status,
    type,
    lastConsumedAt,
    consumptionCount,
    cellarLocation,
    drinkFrom,
    drinkUntil,
    price,
    currency,
    store,
    purchasedAt,
  } = payload;

  if (name !== undefined) wine.name = String(name).trim();
  if (winery !== undefined) wine.winery = String(winery).trim();
  if (line !== undefined) wine.line = String(line).trim();
  if (vintage !== undefined) wine.vintage = vintage ? parseInt(vintage) : null;
  if (region !== undefined) wine.region = String(region).trim();
  if (varietal !== undefined) wine.varietal = String(varietal).trim();
  if (notes !== undefined) wine.notes = String(notes).trim();
  if (type !== undefined) wine.type = type;
  if (rating !== undefined) wine.rating = parseInt(rating);
  if (favorite !== undefined) wine.favorite = favorite === true;
  // Editar la cantidad a mano fija un total, y los lotes se acomodan hacia
  // donde haga falta: si baja se descuenta FIFO (se vacía primero lo más viejo)
  // y si sube, la diferencia entra como lote de hoy. Se resuelve acá y no en el
  // hook del modelo porque acá todavía tenemos la cantidad ANTERIOR, que es la
  // que le da su lote inicial a un vino cargado antes de que existieran.
  if (quantity !== undefined) {
    const nuevaCantidad = parseQuantity(quantity, wine.quantity);
    wine.lots = reconcileLots(wine.lots, nuevaCantidad, {
      createdAt: wine.createdAt,
      currentQuantity: wine.quantity,
    });
    wine.quantity = availableFromLots(wine.lots);
  }
  if (status !== undefined) wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity, status });
  if (lastConsumedAt !== undefined) wine.lastConsumedAt = lastConsumedAt ? new Date(lastConsumedAt) : null;
  if (consumptionCount !== undefined) wine.consumptionCount = parseQuantity(consumptionCount, wine.consumptionCount || 0);

  if (cellarLocation !== undefined) wine.cellar = { ...wine.cellar, location: cellarLocation?.trim() || undefined };
  if (drinkFrom !== undefined) wine.cellar = { ...wine.cellar, drinkFrom: drinkFrom ? parseInt(drinkFrom) : undefined };
  if (drinkUntil !== undefined) wine.cellar = { ...wine.cellar, drinkUntil: drinkUntil ? parseInt(drinkUntil) : undefined };
  if (price !== undefined) wine.purchase = { ...wine.purchase, price: price !== "" ? parseFloat(price) : undefined };
  if (currency !== undefined) wine.purchase = { ...wine.purchase, currency };
  if (store !== undefined) wine.purchase = { ...wine.purchase, store: store?.trim() || undefined };
  if (purchasedAt !== undefined) wine.purchase = { ...wine.purchase, purchasedAt: purchasedAt ? new Date(purchasedAt) : null };

  const wasTasted = wine.tasted;

  // `tasted` es un HECHO de tu historial —"este vino ya lo tomé alguna vez"— y
  // no toca el stock.
  //
  // Antes sí lo tocaba: marcar "probado" descontaba una botella y destildarlo la
  // devolvía. Eso mezclaba dos cosas distintas en un mismo botón y dejaba
  // lecturas raras en pantalla ("Probado ×2": ¿lo tomé o me quedan dos?), además
  // de no cubrir los casos obvios en los que probaste un vino que no era tuyo o
  // regalaste una botella sin abrirla.
  //
  // Abrir una botella es ahora su propia acción, con su propio botón, y viaja
  // por `adjustStock` (`PATCH /wines/:id/stock` con `markTasted`), que descuenta
  // y marca probado en un solo update atómico.
  if (tasted !== undefined) wine.tasted = tasted === true;

  // `status` se recalcula desde lo que quedó (probado + stock), salvo que el
  // payload haya pedido uno explícito —ya aplicado más arriba—.
  //
  // Antes se le pasaba el status GUARDADO, y como `toWineStatus` respeta
  // cualquier status que reciba, la línea no hacía nada: un vino marcado como
  // probado se quedaba para siempre en "stock" y las estadísticas del perfil lo
  // contaban del lado equivocado.
  if (status === undefined) {
    wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity });
  }

  wine.updatedAt = new Date();
  const updatedWine = await wine.save();

  const user = await User.findById(userId);
  if (wasTasted !== updatedWine.tasted) {
    if (updatedWine.tasted) user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
    else user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
    await user.save();
  }

  await logChange(user, "update", updatedWine._id, beforeSnapshot, {
    name: updatedWine.name,
    winery: updatedWine.winery,
  });

  return updatedWine;
}

/**
 * Ajusta el stock de forma ATÓMICA.
 *
 * Antes era leer, sumar en Node y guardar. Dos toques rápidos en "+" salían
 * casi juntos, los dos leían quantity=1 y los dos escribían 2: una de las dos
 * botellas se perdía sin ningún error. Es el patrón clásico de lost update, y
 * en un teléfono —donde tocar dos veces seguido es lo normal— pasa de verdad.
 *
 * Ahora la suma la hace Mongo dentro del propio documento con un pipeline de
 * actualización, así que las dos operaciones se serializan y ninguna pisa a la
 * otra. Los lotes se mueven en ESE MISMO pipeline —y `quantity` sale de su
 * suma— para que nunca puedan quedar dos escrituras compitiendo por el stock,
 * ni `status` desincronizarse de la cantidad ya resuelta.
 *
 * Qué significa cada movimiento:
 *   delta > 0    → repusiste: lote nuevo, con fecha de hoy.
 *   delta < 0    → abriste botellas: FIFO, del lote más viejo que tenga stock.
 *   quantity = n → fijás el total: los lotes se acomodan hacia donde haga falta.
 *
 * `markTasted` es "abrí una botella" dicho entero: descuenta Y deja el vino
 * marcado como probado, con su fecha de consumo, en el MISMO update. Es una
 * sola operación porque es un solo hecho: si fueran dos llamadas, una podría
 * quedar a mitad de camino y el vino terminaría descontado pero sin registrar.
 * El "−" pelado no la usa: descontar no siempre es tomárselo (regalaste una
 * botella, corregís un número), y eso no debería mentir sobre tu historial.
 *
 * `undoOpen` deshace exactamente eso, y es lo que hace el "Deshacer" del aviso:
 * la botella vuelve al LOTE del que salió (no entra como compra de hoy, que
 * haría figurar recién llegado a un vino que tenés desde hace años), el contador
 * de consumos baja y `tasted` vuelve a como estaba —`wasTasted` dice a qué, para
 * no borrar un "probado" que ya era cierto antes de abrir esta botella—.
 */
async function adjustStock(userId, id, { delta, quantity, markTasted, undoOpen, wasTasted }) {
  // Un "no movimiento" igual pasa por el pipeline: normaliza los lotes de un
  // vino cargado antes de que existieran y recalcula status, que es justo lo
  // que hacía la versión anterior ante una entrada inválida.
  let stages = buildStockStages("consume", { $literal: 0 });

  if (quantity !== undefined) {
    // Fijar un valor exacto es idempotente: no hay problema de concurrencia.
    // Si lo que llega no es un número válido NO se toca el stock: poner 0 ante
    // un dato inválido sería vaciar la cava por un error de tipeo.
    const parsed = parseInt(quantity, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      stages = buildStockStages("set", { $literal: parsed });
    }
  } else {
    const movimiento = Number.parseInt(delta, 10);
    if (Number.isFinite(movimiento) && movimiento !== 0) {
      // Deshacer devuelve la botella a su lote; reponer abre uno nuevo. Es la
      // diferencia entre "me equivoqué" y "compré más", y se nota en la ficha.
      const op = movimiento > 0 ? (undoOpen === true ? "return" : "restock") : "consume";
      stages = buildStockStages(op, { $literal: Math.abs(movimiento) });
    }
  }

  // "Abrí una botella": el consumo queda registrado en el mismo paso. Va ANTES
  // de las etapas de stock a propósito, porque el `status` que calculan al final
  // se decide mirando `tasted`.
  const abriendo = markTasted === true;
  const deshaciendo = undoOpen === true;

  if (abriendo) {
    stages = [
      {
        $set: {
          tasted: true,
          lastConsumedAt: "$$NOW",
          consumptionCount: { $add: [{ $ifNull: ["$consumptionCount", 0] }, 1] },
        },
      },
      ...stages,
    ];
  } else if (deshaciendo) {
    // El consumo nunca ocurrió: se descuenta del contador y `tasted` vuelve a
    // donde estaba. Si con esto el vino queda sin consumos, tampoco tiene una
    // "última vez que lo tomaste" que contar.
    const consumos = { $max: [0, { $subtract: [{ $ifNull: ["$consumptionCount", 0] }, 1] }] };
    stages = [
      { $set: { consumptionCount: consumos, tasted: wasTasted === true } },
      {
        $set: {
          lastConsumedAt: {
            $cond: [{ $eq: ["$consumptionCount", 0] }, null, "$lastConsumedAt"],
          },
        },
      },
      ...stages,
    ];
  }

  // Para saber si hay que mover el contador de probados del perfil hace falta el
  // valor ANTERIOR, y el pipeline sólo devuelve el posterior.
  const antes =
    abriendo || deshaciendo
      ? await Wine.findOne({ _id: id, userId }).select("tasted")
      : null;

  const updated = await Wine.findOneAndUpdate({ _id: id, userId }, stages, {
    returnDocument: "after",
    updatePipeline: true,
  });

  if (updated && antes && antes.tasted !== updated.tasted) {
    const user = await User.findById(userId);
    if (user) {
      const n = user.stats.tastedWines || 0;
      user.stats.tastedWines = updated.tasted ? n + 1 : Math.max(0, n - 1);
      await user.save();
    }
  }

  return updated;
}

async function getMoments(userId, id) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const moments = await WineMoment.find({ wineId: wine._id, userId }).sort({ consumedAt: -1 });
  return moments;
}

async function addMoment(userId, id, body) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  // Hasta 2 fotos: las subimos a Cloudinary (o base64 si no está configurado).
  const rawPhotos = Array.isArray(body.photos) ? body.photos.slice(0, 2) : [];
  const photos = [];
  for (const p of rawPhotos) {
    const value = String(p || "").trim();
    if (!/^(data:image\/|https?:\/\/)/.test(value)) continue;
    photos.push(await imageStorage.store(value, { folder: "rincones/moments" }));
  }

  const moment = await WineMoment.create({
    userId,
    wineId: wine._id,
    consumedAt: body.consumedAt ? new Date(body.consumedAt) : new Date(),
    occasion: String(body.occasion || "").trim(),
    companions: String(body.companions || "").trim(),
    place: String(body.place || "").trim(),
    emotion: String(body.emotion || "").trim(),
    foodPairing: String(body.foodPairing || "").trim(),
    notes: String(body.notes || "").trim(),
    rating: body.rating !== undefined ? Number(body.rating) : wine.rating,
    photos,
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean).map((t) => String(t).trim()) : [],
  });

  const wasTasted = wine.tasted;
  wine.consumptionCount = Number(wine.consumptionCount || 0) + 1;
  wine.lastConsumedAt = moment.consumedAt;
  wine.tasted = true;
  wine.status = toWineStatus({ tasted: true, quantity: wine.quantity, status: wine.status });
  await wine.save();

  if (!wasTasted) {
    const user = await User.findById(userId);
    user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
    await user.save();
  }

  return moment;
}

async function getSpendingStats(userId) {
  const ObjectId = mongoose.Types.ObjectId;
  const userObjectId = new ObjectId(userId);

  const agg = await Wine.aggregate([
    { $match: { userId: userObjectId, "purchase.price": { $exists: true, $gt: 0 } } },
    {
      $facet: {
        total: [
          { $group: { _id: null, totalSpent: { $sum: "$purchase.price" }, count: { $sum: 1 } } },
        ],
        byMonth: [
          { $match: { "purchase.purchasedAt": { $exists: true } } },
          {
            $group: {
              _id: {
                year:  { $year: "$purchase.purchasedAt" },
                month: { $month: "$purchase.purchasedAt" },
              },
              total: { $sum: "$purchase.price" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1 } },
          { $limit: 12 },
        ],
        byType: [
          {
            $group: {
              _id: "$type",
              avgPrice: { $avg: "$purchase.price" },
              count:    { $sum: 1 },
            },
          },
          { $sort: { avgPrice: -1 } },
        ],
        bestValue: [
          { $match: { rating: { $gt: 0 } } },
          {
            $addFields: {
              valueScore: { $divide: ["$rating", { $add: ["$purchase.price", 1] }] },
            },
          },
          { $sort: { valueScore: -1 } },
          { $limit: 1 },
          { $project: { name: 1, winery: 1, rating: 1, "purchase.price": 1 } },
        ],
      },
    },
  ]).exec();

  const out = agg && agg[0] ? agg[0] : {};
  const totalRow = out.total && out.total[0];

  return {
    totalSpent:    totalRow ? totalRow.totalSpent : 0,
    winesWithPrice: totalRow ? totalRow.count : 0,
    byMonth: (out.byMonth || []).map((r) => ({
      year:  r._id.year,
      month: r._id.month,
      total: r.total,
      count: r.count,
    })),
    avgPriceByType: (out.byType || []).map((r) => ({
      type:     r._id || "unknown",
      avgPrice: Math.round(r.avgPrice),
      count:    r.count,
    })),
    bestValueWine: out.bestValue && out.bestValue[0] ? out.bestValue[0] : null,
  };
}

const FOOD_PAIRINGS = {
  asado:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Bonarda", "Tannat", "Petit Verdot"] },
  carne:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Tannat", "Petit Verdot"] },
  pollo:    { types: ["white", "red"],              varietals: ["Chardonnay", "Pinot Noir", "Torrontés", "Viognier"] },
  pasta:    { types: ["red", "white"],              varietals: ["Merlot", "Bonarda", "Chardonnay", "Pinot Noir", "Sangiovese"] },
  pizza:    { types: ["red"],                       varietals: ["Bonarda", "Sangiovese", "Malbec", "Tempranillo"] },
  pescado:  { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Torrontés", "Chardonnay", "Pinot Grigio", "Viognier"] },
  mariscos: { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Chardonnay", "Pinot Grigio", "Albariño"] },
  picada:   { types: ["red", "white"],              varietals: ["Malbec", "Bonarda", "Torrontés", "Chardonnay"] },
  queso:    { types: ["red", "white", "fortified"], varietals: ["Malbec", "Chardonnay", "Sémillon", "Gewürztraminer"] },
  ensalada: { types: ["white", "rosé", "sparkling"],varietals: ["Sauvignon Blanc", "Torrontés", "Pinot Grigio"] },
  postre:   { types: ["sparkling", "fortified"],    varietals: ["Torrontés", "Gewürztraminer", "Chenin Blanc", "Moscato"] },
  solo:     { types: [],                            varietals: [] },
};

function daysSince(date) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function scoreWine(wine, context) {
  let score = 0;
  const reasons = [];

  // Rating del usuario (máx 30)
  if (wine.rating > 0) {
    score += wine.rating * 6;
    reasons.push(`${wine.rating}★`);
  }

  // Favorito
  if (wine.favorite) {
    score += 10;
    reasons.push("Favorito");
  }

  const pairing = context.food ? FOOD_PAIRINGS[context.food] : null;

  // Maridaje — tipo. Es la regla que MÁS puntaje da (+20) y hasta ahora era
  // muda: el vino subía al primer puesto sin decir por qué, y la tarjeta caía a
  // "Disponible en tu bodega", que no explica nada.
  if (pairing && pairing.types.length > 0 && pairing.types.includes(wine.type)) {
    score += 20;
    reasons.push(`Va bien con ${context.food}`);
  }

  // Maridaje — varietal
  if (pairing && wine.varietal) {
    const match = pairing.varietals.some((v) =>
      wine.varietal.toLowerCase().includes(v.toLowerCase())
    );
    if (match) {
      score += 15;
      reasons.push("Maridaría bien");
    }
  }

  // Estilo buscado (refina; la comida es el driver principal).
  const m = context.mood;
  if (m === "liviano" && ["white", "sparkling", "rosé"].includes(wine.type)) {
    score += 12;
    reasons.push("Liviano, como pediste");
  }
  if (m === "cuerpo" && ["red", "fortified"].includes(wine.type)) {
    score += 12;
    reasons.push("Con el cuerpo que buscabas");
  }
  if (m === "festivo" && wine.type === "sparkling") {
    score += 15;
    reasons.push("Para brindar");
  }

  // Novedad — bonus si nunca fue probado. Se dice sólo si no hay un motivo
  // mejor: es el más débil de todos y no debería tapar al maridaje.
  if (!wine.tasted) {
    score += 5;
    if (reasons.length === 0) reasons.push("Todavía no lo probaste");
  }

  // Penalización por consumo reciente
  if (wine.lastConsumedAt && daysSince(wine.lastConsumedAt) < 7) score -= 10;

  // Ventana óptima
  const cellar = getCellarStatus(wine);
  if (cellar.status === "peak") {
    score += 10;
    reasons.push("Momento óptimo");
  }

  return { score, reasons };
}

/**
 * ¿Este vino puede ser una respuesta para esta comida?
 *
 * El puntaje solo no alcanzaba: un tinto de 5★ suma 30 puntos por rating y 10
 * por favorito, así que le ganaba a cualquier regla de maridaje y aparecía
 * recomendado para pescado. Un Malbec no es una respuesta a "¿qué tomo con
 * pescado?" por mucho que te guste, y ofrecerlo hace quedar mal al Sommelier.
 *
 * Es un veto, no una penalización: si la comida define tipos, el vino tiene que
 * ser de alguno de ellos. Los vinos sin tipo conocido pasan (no sabemos que
 * estén mal), y "sin comida" no filtra nada.
 */
function fitsFood(wine, context) {
  const pairing = context.food ? FOOD_PAIRINGS[context.food] : null;
  if (!pairing || pairing.types.length === 0) return true;
  if (!wine.type || wine.type === "unknown") return true;
  return pairing.types.includes(wine.type);
}

async function suggestWines(userId, context = {}) {
  const all = await Wine.find({ userId, quantity: { $gt: 0 } }).select("-rawText");
  const wines = all.filter((w) => fitsFood(w, context));

  const scored = wines
    .map((wine) => {
      const { score, reasons } = scoreWine(wine, context);
      return { wine, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ wine, score, reasons }) => ({
    ...wine.toObject(),
    matchScore: score,
    matchReason: reasons.join(" · ") || "Disponible en tu bodega",
  }));
}

async function getCellarReady(userId) {
  const wines = await Wine.find({ userId, quantity: { $gt: 0 } }).select("-rawText");
  return wines
    .filter((w) => getCellarStatus(w).status === "peak")
    .map((w) => ({ ...w.toObject(), cellarStatus: getCellarStatus(w) }));
}

async function deleteWine(userId, id) {
  const wine = await Wine.findOne({ _id: id, userId });
  if (!wine) return null;

  const user = await User.findById(userId);
  user.stats.winesCount = Math.max(0, (user.stats.winesCount || 0) - 1);
  if (wine.tasted) user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
  await user.save();

  await Wine.deleteOne({ _id: id, userId });
  await logChange(user, "delete", wine._id, { name: wine.name, winery: wine.winery }, null);
  return true;
}

/**
 * Cuántos vinos acepta una operación en lote.
 *
 * Es el techo de "seleccionar todo" en una bodega grande. Con más que esto la
 * petición empieza a durar lo suficiente como para que alguien la cancele a la
 * mitad, y una selección tan grande casi siempre es un error de dedo que conviene
 * frenar antes de borrar media colección.
 */
const MAX_EN_LOTE = 200;

/** Qué se puede hacer sobre varios vinos a la vez, y qué escribe cada cosa. */
const ACCIONES_EN_LOTE = {
  tasted: { $set: { tasted: true } },
  untasted: { $set: { tasted: false } },
  favorite: { $set: { favorite: true } },
  unfavorite: { $set: { favorite: false } },
};

/**
 * Aplica una acción a varios vinos de una.
 *
 * ── POR QUÉ UN ENDPOINT Y NO UN FOR EN EL NAVEGADOR ─────────────────────────
 * Porque marcar treinta vinos serían treinta peticiones que llegan en cualquier
 * orden, cada una con su chance de fallar: la pantalla queda a mitad de camino y
 * el usuario no tiene forma de saber cuáles entraron. Acá es una escritura, y el
 * número que vuelve es el que se le muestra.
 *
 * El `userId` va en el filtro de la consulta, no se verifica antes: es lo que
 * hace imposible tocar el vino de otro mandando su id en la lista, incluso si
 * alguien arma la petición a mano.
 */
async function bulkAction(userId, ids, action) {
  const limpios = [...new Set((Array.isArray(ids) ? ids : []).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .slice(0, MAX_EN_LOTE);

  if (limpios.length === 0) return { affected: 0 };

  const filtro = { _id: { $in: limpios }, userId };

  if (action === "delete") {
    // Se leen antes de borrar: hacen falta para las estadísticas del usuario y
    // para dejar en la auditoría qué era cada uno, que después no se puede saber.
    const vinos = await Wine.find(filtro).select("_id name winery tasted").lean();
    if (vinos.length === 0) return { affected: 0 };

    const { deletedCount } = await Wine.deleteMany(filtro);

    const user = await User.findById(userId);
    if (user) {
      const probados = vinos.filter((w) => w.tasted).length;
      user.stats.winesCount = Math.max(0, (user.stats.winesCount || 0) - vinos.length);
      user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - probados);
      await user.save();
      for (const w of vinos) {
        await logChange(user, "delete", w._id, { name: w.name, winery: w.winery }, null);
      }
    }
    return { affected: deletedCount };
  }

  const update = ACCIONES_EN_LOTE[action];
  if (!update) return null;

  const { modifiedCount } = await Wine.updateMany(filtro, update);

  // `tastedWines` se recalcula contando, en vez de sumar y restar: en un lote no
  // se sabe cuántos de los seleccionados ya estaban marcados, y una cuenta
  // incremental sobre datos que no se leyeron es exactamente cómo un contador
  // empieza a mentir sin que falle nada.
  if (action === "tasted" || action === "untasted") {
    const user = await User.findById(userId);
    if (user) {
      user.stats.tastedWines = await Wine.countDocuments({ userId, tasted: true });
      await user.save();
    }
  }

  return { affected: modifiedCount };
}

module.exports = {
  listWines,
  searchWines,
  getStatsSummary,
  getSpendingStats,
  getWineById,
  createWine,
  updateWine,
  adjustStock,
  getMoments,
  addMoment,
  deleteWine,
  bulkAction,
  suggestWines,
  getCellarReady,
  MAX_EN_LOTE,
};
