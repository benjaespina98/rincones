const mongoose = require("mongoose");

// Caché de lecturas de etiqueta por hash de imagen.
//
// Mismo criterio que CatalogSearch (ver ese modelo): Gemini Vision cuesta cuota
// y tarda varios segundos, y una misma foto puede llegar más de una vez —
// reintentos tras un timeout del cliente, la misma botella fotografiada por dos
// personas del grupo, o simplemente volver a mandar la misma imagen. Guardamos
// el resultado ya resuelto por el hash exacto del archivo subido y lo servimos
// de una sin tocar Gemini ni el OCR.
//
// Es un hash exacto (SHA-256 del buffer), no perceptual: dos fotos de la misma
// etiqueta sacadas en momentos distintos casi nunca van a coincidir byte a
// byte, así que esto no reemplaza el matching de catálogo — sólo evita volver
// a pagar por el EXACTO mismo archivo.
const labelScanCacheSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

labelScanCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("LabelScanCache", labelScanCacheSchema);
