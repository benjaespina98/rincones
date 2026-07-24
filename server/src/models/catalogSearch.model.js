const mongoose = require("mongoose");

// Caché de búsquedas resueltas por Gemini.
//
// Cada consulta al modelo cuesta plata y tarda ~1-2s, y las búsquedas se repiten
// muchísimo entre usuarios ("malbec", "catena"). Guardamos el resultado por
// consulta normalizada y lo servimos desde acá.
//
// `expiresAt` + índice TTL hacen que Mongo borre solo las entradas viejas, así
// el catálogo se refresca cada tanto sin tarea de limpieza.
const catalogSearchSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    results: {
      type: Array,
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

catalogSearchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("CatalogSearch", catalogSearchSchema);
