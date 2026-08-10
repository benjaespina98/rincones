const mongoose = require("mongoose");

const changeLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      default: "wine",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      enum: ["create", "update", "delete"],
      required: true,
    },
    actor: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      email: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        default: "admin",
      },
    },
    before: {
      type: Object,
      default: null,
    },
    after: {
      type: Object,
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

// El panel lo lee siempre por fecha: el listado ordena por `createdAt` y el
// resumen cuenta `createdAt >= desde`. Hoy la colección es chica y no se nota,
// pero sin este índice esas dos consultas van a recorrer la tabla entera a
// medida que crezca el historial de auditoría.
changeLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ChangeLog", changeLogSchema);
