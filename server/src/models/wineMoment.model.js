const mongoose = require("mongoose");

const wineMomentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El userId es obligatorio"],
      index: true,
    },
    wineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wine",
      required: [true, "El wineId es obligatorio"],
      index: true,
    },

    /**
     * Qué vino era, copiado al momento de escribirlo.
     *
     * ── POR QUÉ SE DUPLICA ─────────────────────────────────────────────────
     * El momento apuntaba al vino sólo por id, así que borrar el vino de Mi
     * Bodega dejaba el recuerdo sin nombre: el diario mostraba la fecha, con
     * quién estabas y qué comiste, pero no QUÉ TOMASTE. La entrada seguía
     * existiendo y era ilegible, que es la peor de las dos opciones — o se
     * conserva entero o no se conserva.
     *
     * Es una copia deliberada y no una desnormalización por rendimiento: un
     * momento es un hecho del pasado y tiene que quedar escrito como fue. Si
     * después renombrás el vino, el momento viejo conserva el nombre que tenía
     * esa noche, que además es lo correcto.
     *
     * El `wineId` se queda igual: mientras el vino exista, la ficha manda (foto
     * actualizada, datos corregidos) y esto es sólo el respaldo.
     */
    wineSnapshot: {
      name: { type: String, trim: true, default: "" },
      winery: { type: String, trim: true, default: "" },
      varietal: { type: String, trim: true, default: "" },
      type: { type: String, trim: true, default: "" },
      image: { type: String, default: "" },
    },
    consumedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    occasion: {
      type: String,
      trim: true,
      default: "",
    },
    companions: {
      type: String,
      trim: true,
      default: "",
    },
    place: {
      type: String,
      trim: true,
      default: "",
    },
    emotion: {
      type: String,
      trim: true,
      default: "",
    },
    foodPairing: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    photo: {
      type: String,
      trim: true,
      default: "",
    },
    // Hasta 2 fotos del momento (privadas). URLs de Cloudinary (o base64 fallback).
    photos: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
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

wineMomentSchema.index({ userId: 1, wineId: 1, consumedAt: -1 });
wineMomentSchema.index({ userId: 1, consumedAt: -1 });

module.exports = mongoose.model("WineMoment", wineMomentSchema);
