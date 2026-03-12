const mongoose = require("mongoose");

const changeLogSchema = new mongoose.Schema(
  {
    lugarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lugar",
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

module.exports = mongoose.model("ChangeLog", changeLogSchema);
