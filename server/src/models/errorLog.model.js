const mongoose = require("mongoose");

/**
 * Los fallos de verdad del servidor — un 500, una excepción que se escapó,
 * un `AbortError` de Gemini — hasta ahora sólo vivían en la consola de la
 * terminal: útiles mientras alguien está mirando esa terminal, invisibles un
 * minuto después. `ChangeLog` audita lo que HACE una persona (crear, editar,
 * borrar); esto audita lo que se ROMPE, que es una pregunta distinta y hasta
 * ahora no tenía dónde vivir.
 *
 * TTL de 30 días: un log de error es para diagnosticar algo reciente, no un
 * historial que hay que conservar para siempre — a diferencia de `ChangeLog`,
 * que si audita "quién borró esta cuenta" tiene que aguantar.
 */
const errorLogSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
    },
    stack: {
      type: String,
      default: "",
    },
    method: {
      type: String,
      default: "",
    },
    route: {
      type: String,
      default: "",
    },
    statusCode: {
      type: Number,
      default: 500,
    },
    // Quién estaba haciendo el pedido cuando explotó, si se sabe — no siempre
    // hay sesión (un endpoint público, un token vencido).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

errorLogSchema.index({ createdAt: -1 });
// Se borran solos a los 30 días: ver el comentario de arriba.
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model("ErrorLog", errorLogSchema);
