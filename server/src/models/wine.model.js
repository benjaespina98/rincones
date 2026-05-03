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
    image: {
      type: String, // URL de la imagen
    },
    rawText: {
      type: String, // Texto extraído por OCR
    },
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

module.exports = mongoose.model("Wine", wineSchema);
