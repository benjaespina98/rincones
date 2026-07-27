const mongoose = require("mongoose");

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
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    lastConsumedAt: {
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
        avgRating: [{ $group: { _id: null, avgRating: { $avg: "$rating" } } }],
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              stock: { $sum: { $cond: [{ $eq: ["$status", "stock"] }, 1, 0] } },
              consumed: { $sum: { $cond: [{ $eq: ["$status", "tasted"] }, 1, 0] } },
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
