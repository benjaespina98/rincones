const mongoose = require("mongoose");

// Reseña pública de un vino, compartida entre todos los usuarios.
//
// A diferencia de `Wine.rating` y `Wine.notes` (que son PRIVADOS y sólo los ve
// su dueño), una reseña es explícitamente pública: aparece cuando cualquiera
// busca ese vino. Por eso es una colección aparte y no un campo del vino —
// publicar es una acción deliberada, no un efecto secundario de puntuar.
//
// Se agrupa por la misma clave que los otros pools comunitarios (fotos, precios):
// nombre + bodega normalizados.
const wineReviewSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    text: { type: String, trim: true, default: "", maxlength: 1000 },
    // Se copian al publicar: la reseña sobrevive aunque el autor cambie su
    // perfil, y evitamos un populate por cada reseña al listarlas.
    authorName: { type: String, trim: true, default: "" },
    authorAvatar: { type: String, trim: true, default: "" },
    // Para poder mostrar de qué vino es sin resolver la clave.
    name: { type: String, trim: true, default: "" },
    winery: { type: String, trim: true, default: "" },
    // Parte de la identidad del vino, igual que en los pools de fotos y precios.
    // La clave ya la incorpora; guardarla aparte permite reclavear si algún día
    // cambia la fórmula, cosa que sin este campo sería imposible.
    varietal: { type: String, trim: true, default: "" },
    /**
     * Qué cosecha tomó ESA persona.
     *
     * NO entra en la clave, y esa es la decisión de fondo: separando el promedio
     * por año, cada balde quedaría con una o dos reseñas y el promedio dejaría
     * de decir nada. Vivino puede porque tiene millones de opiniones por vino.
     *
     * Como dato de cada reseña sí sirve: un 2019 y un 2024 del mismo vino no
     * son la misma botella, y quien lee quiere saber cuál probó el otro.
     */
    vintage: { type: Number, min: 1900 },
  },
  { timestamps: true }
);

// Una reseña por persona por vino: publicar de nuevo edita la existente.
wineReviewSchema.index({ key: 1, userId: 1 }, { unique: true });
wineReviewSchema.index({ key: 1, createdAt: -1 });

module.exports = mongoose.model("WineReview", wineReviewSchema);
