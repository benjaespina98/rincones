const mongoose = require("mongoose");

// Caché compartida de descripciones de vino generadas por Gemini.
//
// Generar una descripción cuesta cuota y ~1-2s. La misma botella la abren
// muchos usuarios, así que cacheamos por vino (nombre + bodega normalizados) y
// la reusamos entre todos. Sin TTL: una descripción de estilo no caduca.
const wineInfoSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    info: {
      summary: String,
      body: String,
      profile: [String],
      structure: { body: Number, acidity: Number, tannin: Number, sweetness: Number },
      similarTo: [String],
      aromas: [String],
      foodPairing: [String],
      alcohol: Number,
      serve: String,
      known: Boolean,
      // El "¿sabías que?". Va en la caché compartida como todo lo demás: la
      // curiosidad es del vino, no de quien la pidió.
      funFact: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WineInfo", wineInfoSchema);
