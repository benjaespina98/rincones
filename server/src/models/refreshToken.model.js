const mongoose = require("mongoose");

/**
 * Sesiones de larga duración, revocables.
 *
 * Antes el único token duraba 7 días y era un JWT puro: no había forma de
 * invalidarlo antes de que expirara. Si alguien te robaba la sesión, o si
 * cerrabas sesión en un teléfono que perdiste, ese token seguía funcionando una
 * semana entera. Cambiar la contraseña tampoco lo cortaba.
 *
 * Ahora el token de acceso dura minutos y este documento es el que decide si la
 * sesión sigue viva. Borrarlo la termina en el acto.
 *
 * Se guarda el HASH del token, no el token. Si alguien lee la base, no se lleva
 * credenciales usables — misma lógica que con las contraseñas.
 */
const refreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  // Para que el usuario pueda reconocer sus sesiones y para diagnosticar.
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// Mongo borra solo los documentos vencidos: la colección no crece sin control
// aunque nadie cierre sesión nunca.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
