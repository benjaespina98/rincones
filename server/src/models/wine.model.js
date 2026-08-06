const mongoose = require("mongoose");
const { availableFromLots, normalizeLots, reconcileLots } = require("../utils/lots");

/**
 * Un lote es una compra: cuántas botellas entraron, cuándo, y cuántas quedan.
 *
 * `quantity` y `remaining` son dos cosas distintas y ahí está todo el asunto:
 * `quantity` es lo que trajo esa compra y no baja nunca, `remaining` es lo que
 * sigue en la cava. Un lote agotado (`remaining: 0`) se QUEDA en el array: es el
 * registro de qué botellas te tomaste y de dónde salieron. El stock del vino es
 * la suma de los `remaining`; ver `utils/lots.js`.
 *
 * Sin `_id` a propósito: los ajustes de stock reescriben el array desde un
 * pipeline de agregación (para que la cuenta sea atómica) y Mongo no genera
 * ObjectIds ahí. Un lote se identifica por su fecha.
 */
const lotSchema = new mongoose.Schema(
  {
    addedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Cuántas botellas entraron con esta compra. Inmutable salvo devolución.
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    // Cuántas de ésas siguen estando. 0 = lote agotado, que igual se conserva.
    remaining: {
      type: Number,
      required: true,
      min: 0,
    },
    // Cuándo se terminó la última botella de este lote. Sólo en los agotados.
    depletedAt: {
      type: Date,
    },
    // Preparados para cuando la ficha deje registrar qué pagaste por CADA
    // compra —hoy `purchase` guarda una sola, la última—. Nadie los escribe
    // todavía, pero todo el manejo de lotes los conserva si aparecen.
    price: {
      type: Number,
      min: 0,
    },
    store: {
      type: String,
      trim: true,
    },
  },
  { _id: false, versionKey: false }
);

const wineSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El userId es obligatorio"],
    },
    name: {
      type: String,
      required: [true, "El nombre del vino es obligatorio"],
      trim: true,
    },
    winery: {
      type: String,
      trim: true,
    },
    // Gama/línea de la bodega ("Reserva", "Broquel", "Serie A"). Aditivo: los
    // documentos viejos no lo tienen y siguen funcionando — todo lector cae al
    // `name` guardado, que sigue siendo el nombre visible.
    line: {
      type: String,
      trim: true,
      default: "",
    },
    vintage: {
      type: Number,
      min: [1900, "El año debe ser válido"],
      max: [new Date().getFullYear(), "El año no puede ser futuro"],
    },
    region: {
      type: String,
      trim: true,
    },
    varietal: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["stock", "tasted", "archived"],
      default: "stock",
    },
    // Stock disponible. Sigue siendo el campo que consultan los filtros, los
    // índices y la UI; `lots` lo desagrega por compra pero no lo reemplaza.
    // Es SIEMPRE la suma de los `remaining` de los lotes (ver el hook de abajo).
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    // El historial completo de compras, del más viejo al más nuevo. Incluye los
    // lotes agotados: el consumo es FIFO y el lote que se vacía queda con
    // `remaining: 0` y `depletedAt`, para poder saber de dónde salió cada
    // botella que ya te tomaste.
    lots: {
      type: [lotSchema],
      default: undefined,
    },
    lastConsumedAt: {
      type: Date,
    },
    // Última vez que sumaste botellas de este vino. `createdAt` sigue siendo la
    // fecha de ingreso a la cava y no se mueve nunca; esto cuenta la reposición
    // más reciente.
    //
    // Con `lots` ya en el modelo, esto quedó como el resumen derivado que se
    // preveía: el detalle de cada compra vive en los lotes y este campo es el
    // atajo para "¿cuándo repusiste por última vez?".
    restockedAt: {
      type: Date,
    },
    consumptionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    tasted: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
      default: "unknown",
    },
    // Ficha generada por IA, persistida al crear el vino. Antes se re-pedía en
    // cada apertura de la ficha aunque el modelo ya tenía dónde guardarla.
    description: {
      summary: { type: String, trim: true },
      body: {
        type: String, // Descripción del cuerpo del vino
        trim: true,
      },
      profile: [String], // ["Cuerpo medio", "Taninos suaves"]
      structure: { body: Number, acidity: Number, tannin: Number, sweetness: Number },
      similarTo: [String],
      aromas: [String], // ["cereza", "roble", "especias"]
      foodPairing: [String], // ["carne roja", "queso", "pasta"]
      alcohol: {
        type: Number, // 12.5
        min: 0,
        max: 20,
      },
      serve: { type: String, trim: true }, // "16-18 °C"
      known: { type: Boolean },
      // Una curiosidad sobre la uva, la región o el estilo: lo que se muestra al
      // terminar de escanear y dentro de "Sobre este vino".
      funFact: { type: String, trim: true },
      generatedAt: { type: Date },
    },
    cellar: {
      location: { type: String, trim: true },
      drinkFrom: { type: Number },
      drinkUntil: { type: Number },
    },

    purchase: {
      price:       { type: Number, min: 0 },
      currency:    { type: String, default: "ARS" },
      store:       { type: String, trim: true },
      purchasedAt: { type: Date },
    },

    image: {
      type: String, // URL de la imagen
      default: null,
    },
    imageSource: {
      type: String,
      enum: ["local", "vivino", "unsplash", "user-upload", "ocr", "community"],
      default: "local",
    },
    rawText: {
      type: String, // Texto extraído por OCR
    },
    moments: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        date: {
          type: Date,
          default: Date.now,
        },
        occasion: {
          type: String,
          enum: [
            "dinner",
            "celebration",
            "gift",
            "tasting",
            "casual",
            "other",
          ],
        },
        companions: [String], // ["Juan", "María"]
        place: String, // "Restaurante La Trattoria"
        emotion: {
          type: String,
          enum: ["happy", "relaxed", "social", "thoughtful", "adventurous"],
        },
        foodPairingActual: String, // Lo que comí con el vino
        notes: String, // Notas personales del momento
        rating: {
          type: Number,
          min: 0,
          max: 5,
        },
        photo: String, // URL de foto del momento (opcional)
        tags: [String], // ["favorito", "recomendado", "no-repeat"]
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Índices para búsquedas rápidas
wineSchema.index({ userId: 1, createdAt: -1 });
wineSchema.index({ userId: 1, name: 1 });
wineSchema.index({ userId: 1, favorite: 1, tasted: 1 });
wineSchema.index({ userId: 1, status: 1, quantity: 1 });
wineSchema.index({ userId: 1, "purchase.purchasedAt": -1 });

// Keep `updatedAt` fresh
wineSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

/**
 * La invariante `quantity === suma de los remaining`, sostenida en cada `save()`.
 *
 * Los updates atómicos ya la garantizan por su lado (los pipelines de
 * `utils/lots.js` recalculan quantity desde los lotes en el mismo paso). Este
 * hook cubre el otro camino: todo el código que trabaja con el documento en
 * memoria —crear un vino, editar la cantidad a mano desde la ficha— y que
 * escribe `quantity` sin saber que existen los lotes.
 *
 * Quién manda depende de qué tocaron:
 *  - no hay lotes todavía (vino nuevo, o anterior a esta versión) → se deriva
 *    el lote inicial de `quantity` + `createdAt`, igual que la migración;
 *  - tocaron `quantity` y no los lotes → los lotes se acomodan (FIFO al bajar,
 *    lote nuevo al subir): es lo que espera quien escribe un número en la ficha;
 *  - en cualquier otro caso mandan los lotes y `quantity` sale de su suma.
 *
 * Va en `validate` y no en `save` para que el `min: 0` del esquema se valide
 * sobre los valores ya reconciliados.
 */
wineSchema.pre("validate", function () {
  const lotes = Array.isArray(this.lots) ? this.lots : [];
  const cantidad = Number(this.quantity) || 0;

  if (lotes.length === 0) {
    this.lots = normalizeLots([], { quantity: cantidad, createdAt: this.createdAt });
    this.quantity = availableFromLots(this.lots);
    return;
  }

  if (this.isModified("quantity") && !this.isModified("lots")) {
    this.lots = reconcileLots(lotes, cantidad, { createdAt: this.createdAt });
  } else {
    this.lots = normalizeLots(lotes, { createdAt: this.createdAt });
  }

  this.quantity = availableFromLots(this.lots);
});

// Instance helper: add a consumption "moment" to a wine
wineSchema.methods.addMoment = async function (momentData) {
  this.moments = this.moments || [];
  const moment = Object.assign({}, momentData, { date: momentData.date || new Date() });
  this.moments.push(moment);

  if (typeof moment.rating === "number") {
    this.rating = moment.rating; // keep latest rating; can be changed to average later
  }

  this.lastConsumedAt = moment.date || new Date();
  this.consumptionCount = (this.consumptionCount || 0) + 1;
  this.status = "tasted";
  this.tasted = true;

  await this.save();
  return this;
};

// Static: aggregate useful stats for a user (used by profile endpoint)
wineSchema.statics.getUserStats = async function (userId) {
  const ObjectId = mongoose.Types.ObjectId;
  const userObjectId = new ObjectId(userId);

  const agg = await this.aggregate([
    { $match: { userId: userObjectId } },
    {
      $facet: {
        countsByType: [
          { $group: { _id: "$type", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        topVarietals: [
          { $group: { _id: "$varietal", count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        topRegions: [
          { $group: { _id: "$region", count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        // Sólo los puntuados. Promediando TODOS, cada vino sin puntuar entraba
        // como un cero: con 62 vinos y 20 puntuados el promedio daba 1.0, un
        // número que no describe a nadie.
        avgRating: [
          { $match: { rating: { $gt: 0 } } },
          { $group: { _id: null, avgRating: { $avg: "$rating" } } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              stock: { $sum: { $cond: [{ $eq: ["$status", "stock"] }, 1, 0] } },
              // Se cuenta por el campo `tasted`, no por `status`. Al terminar
              // la última botella `toWineStatus` pasa el vino a "archived", así
              // que contando por status un vino que te tomaste entero dejaba de
              // figurar entre tus probados justamente cuando más lo probaste.
              consumed: { $sum: { $cond: [{ $eq: ["$tasted", true] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]).exec();

  const out = agg && agg[0] ? agg[0] : {};

  return {
    countsByType: (out.countsByType || []).map((r) => ({ type: r._id || 'unknown', count: r.count })),
    topVarietals: (out.topVarietals || []).map((r) => ({ varietal: r._id, count: r.count })),
    topRegions: (out.topRegions || []).map((r) => ({ region: r._id, count: r.count })),
    avgRating: out.avgRating && out.avgRating[0] ? Number((out.avgRating[0].avgRating || 0).toFixed(2)) : 0,
    totals: out.totals && out.totals[0] ? out.totals[0] : { total: 0, stock: 0, consumed: 0 },
  };
};

module.exports = mongoose.model("Wine", wineSchema);
