const mongoose = require("mongoose");

/**
 * Caché compartida de respuestas de la guía de vino.
 *
 * "¿Qué diferencia hay entre un Malbec y un Cabernet?" la escribe una persona
 * una vez y le sirve a todas las demás para siempre: la respuesta no depende de
 * quién pregunta. Es la misma idea que ya usa `DishPairing` con los platos, y
 * es lo que hace que el costo por consulta tienda a bajar a medida que la app
 * se usa más, en vez de subir.
 *
 * ── QUÉ NO ENTRA ACÁ ────────────────────────────────────────────────────────
 * Todo lo que haya mirado la bodega de alguien. "¿Cuál abro esta noche?" tiene
 * una respuesta distinta para cada persona, y servir la de otro sería peor que
 * no tener caché: sería recomendar botellas que no existen en esa casa. El
 * controlador decide con `usaTuBodega` y no guarda esas.
 *
 * Tampoco las que el modelo marcó fuera de tema: son la respuesta a una
 * pregunta que no queremos volver a contestar igual.
 *
 * `expires` de 60 días: no es por costo de almacenamiento sino porque el
 * catálogo, las cosechas y hasta el precio de referencia se mueven, y una
 * respuesta congelada dos años envejece sin que nadie se entere.
 */
const sommelierAnswerSchema = new mongoose.Schema(
  {
    // La pregunta normalizada (sin acentos, sin puntuación, en minúsculas).
    // Ver `normalizarPregunta` en data/sommelierDomain.js: si acá se armara
    // distinto, "¿Qué es un Malbec?" y "que es un malbec" pagarían dos veces.
    key: { type: String, required: true, unique: true, index: true },
    answer: { type: String, required: true },
    followups: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 },
  },
  { timestamps: false }
);

module.exports = mongoose.model("SommelierAnswer", sommelierAnswerSchema);
