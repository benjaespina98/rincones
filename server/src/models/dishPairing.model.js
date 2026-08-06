const mongoose = require("mongoose");

// Caché compartida de platos ya clasificados.
//
// "Sushi" lo escribe un usuario una vez y le sirve a todos los demás para
// siempre: la respuesta no depende de quién pregunta ni de qué tiene en la
// bodega, sólo del plato. Con esto, el Sommelier a texto libre tiende a costar
// cero llamadas a medida que la gente lo usa.
const dishPairingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // La categoría de FOOD_PAIRINGS con la que el recomendador ya sabe trabajar.
    food: { type: String, required: true },
    // Una línea para mostrarle al usuario por qué. Puede venir vacía.
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DishPairing", dishPairingSchema);
