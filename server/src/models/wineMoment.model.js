const mongoose = require("mongoose");

const wineMomentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El userId es obligatorio"],
      index: true,
    },
    wineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wine",
      required: [true, "El wineId es obligatorio"],
      index: true,
    },
    consumedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    occasion: {
      type: String,
      trim: true,
      default: "",
    },
    companions: {
      type: String,
      trim: true,
      default: "",
    },
    place: {
      type: String,
      trim: true,
      default: "",
    },
    emotion: {
      type: String,
      trim: true,
      default: "",
    },
    foodPairing: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    photo: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

wineMomentSchema.index({ userId: 1, wineId: 1, consumedAt: -1 });
wineMomentSchema.index({ userId: 1, consumedAt: -1 });

module.exports = mongoose.model("WineMoment", wineMomentSchema);
