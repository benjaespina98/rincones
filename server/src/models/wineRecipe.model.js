const mongoose = require("mongoose");

// Caché compartida de recetas generadas por Gemini, igual que WineInfo.
//
// La clave incluye el PLAN (cena de a dos, asado, con amigos, tranqui): el
// mismo vino pide un plato distinto según con quién y dónde lo vas a tomar, y
// eso es justamente lo que hace útil la sugerencia. Sin TTL: una receta no
// caduca, y si algún día hace falta rehacerla alcanza con borrar la colección.
const wineRecipeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    recipe: {
      dish: String,          // "Bife de chorizo con chimichurri"
      why: String,           // Por qué va con ESTE vino
      time: String,          // "40 min"
      servings: Number,      // Para cuántos rinde
      ingredients: [String], // Con cantidades
      steps: [String],       // 4 a 6 pasos
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WineRecipe", wineRecipeSchema);
