const mongoose = require("mongoose");

// Pool de imágenes de vinos, compartido entre todos los usuarios ("stock").
//
// Idea (como en Vivino): cuando alguien escanea/carga la foto de una etiqueta,
// esa foto queda asociada al vino (nombre + bodega normalizados) y sirve como
// imagen para quien busque o cargue ese mismo vino sin foto propia.
//
// Guardamos una sola imagen representativa por vino (la primera que llega). Es
// data URL / base64, igual que el resto de imágenes de la app.
const wineImageSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    // Para poder atribuir / moderar más adelante.
    contributedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: String,
    winery: String,
    // Puntaje 0-100 de wineImageQuality.service.js, sólo cuando Gemini pudo
    // evaluar la imagen (data URL + Gemini configurado). Sin este campo, la
    // foto quedó puesta sin evaluar — igual que TODAS las de antes de que
    // existiera este puntaje. Eso es intencional: una foto nueva y bien
    // puntuada puede desplazar a una vieja sin puntaje, así el pool viejo se
    // va curando solo con el uso, sin necesitar una migración.
    qualityScore: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("WineImage", wineImageSchema);
