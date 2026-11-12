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

  /**
   * ── POR QUÉ EL TOKEN USADO YA NO SE BORRA ─────────────────────────────────
   *
   * La rotación borraba el token viejo en la misma operación que lo buscaba. Es
   * seguro y tiene un modo de falla que en un celular pasa de verdad: si la
   * respuesta no llega —la red se cae, el usuario entra al subte, Vercel arranca
   * en frío y axios corta a los 12 segundos— el token viejo ya no existe y el
   * nuevo se perdió en el camino. La sesión queda muerta sin que nadie haya
   * hecho nada mal, y lo que ve la persona es que la app la mandó al login.
   *
   * Ahora el token usado se conserva y apunta a su reemplazo. Eso permite
   * distinguir los dos casos que antes eran indistinguibles:
   *
   *   el reemplazo NUNCA se usó  → la respuesta se perdió. Es el dueño legítimo
   *                                reintentando: se le da una sesión nueva.
   *   el reemplazo YA se usó     → alguien está reusando un token que su dueño
   *                                ya cambió. Eso es robo, y se cierran TODAS
   *                                las sesiones del usuario.
   *
   * Es la detección de reuso del RFC (OAuth 2.0 Security BCP), y es más estricta
   * que lo que había: antes un token robado y reusado simplemente fallaba, sin
   * avisarle a nadie ni cortar la sesión del atacante.
   */
  usedAt: { type: Date },
  replacedByHash: { type: String },
  // Cuántas veces se re-canjeó este token ya usado (tope en session.service.js).
  graceCount: { type: Number, default: 0 },
});

// Mongo borra solo los documentos vencidos: la colección no crece sin control
// aunque nadie cierre sesión nunca.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
