const mongoose = require("mongoose");

/**
 * Caché de verificaciones de identidad: "¿este vino existe y se llama así?".
 *
 * La pregunta se le hace al modelo en el momento del escaneo, que es el camino
 * crítico de la app (alguien con el teléfono en una mano y la botella en la
 * otra), y la respuesta no depende de la foto sino de la LECTURA: la misma
 * botella escaneada por otra persona, con otra luz y otro encuadre, produce la
 * misma consulta. Por eso se cachea por identidad leída y no por imagen —para
 * eso está `labelScanCache`, que guarda lo que dijo la foto—.
 *
 * Las dos cachés se complementan y hacen falta las dos: la de imagen ahorra la
 * lectura cuando alguien vuelve a subir el MISMO archivo; ésta ahorra la
 * verificación cuando alguien escanea el MISMO VINO, que es muchísimo más
 * frecuente. Un Saint Felicien se verifica una vez para toda la app.
 *
 * `found: false` también se guarda, y es la mitad que más ahorra: los vinos que
 * el modelo no conoce son los que se escanean una y otra vez sin que la
 * respuesta cambie. Preguntar de nuevo cuesta lo mismo que preguntar la primera
 * vez y contesta lo mismo.
 *
 * 30 días, igual que la caché de búsquedas: suficiente para que un escaneo
 * repetido salga gratis, corto para que un vino que el modelo no conocía en
 * agosto pueda conocerse en septiembre. El índice TTL lo limpia solo.
 */
const wineVerificationSchema = new mongoose.Schema(
  {
    // Identidad leída, normalizada: bodega|línea o nombre|uva.
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    found: {
      type: Boolean,
      default: false,
    },
    // El vino tal como lo devolvió el modelo, o null. Sin esquema fijo a
    // propósito: es la respuesta de una fuente externa, y acotarla acá sería
    // duplicar el schema que ya valida `verifyWineWithAi`.
    wine: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

wineVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("WineVerification", wineVerificationSchema);
