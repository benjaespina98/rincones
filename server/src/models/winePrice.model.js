const mongoose = require("mongoose");

// Precio comunitario por vino (nombre + bodega normalizados).
//
// Cada vez que alguien registra lo que pagó por un vino, sumamos ese precio al
// pool y guardamos un agregado (suma + cantidad) para poder mostrar un promedio
// sin recorrer todos los registros. Es el mismo espíritu que el pool de fotos.
const winePriceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    sum: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    currency: { type: String, default: "ARS" },
    // Para poder mostrar rango si hiciera falta.
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    name: String,
    winery: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("WinePrice", winePriceSchema);
