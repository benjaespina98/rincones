const mongoose = require("mongoose");

const wineWishSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    winery: { type: String, trim: true, default: "" },
    type: {
      type: String,
      enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
      default: "unknown",
    },
    region:   { type: String, trim: true, default: "" },
    varietal: { type: String, trim: true, default: "" },
    vintage:  { type: Number },
    notes:    { type: String, trim: true, default: "" },
    source: {
      type: String,
      enum: ["manual", "ocr", "recomendación", "search"],
      default: "manual",
    },
    priority: { type: Number, min: 1, max: 3, default: 2 },
    addedAt:  { type: Date, default: Date.now },
  },
  { versionKey: false }
);

wineWishSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model("WineWish", wineWishSchema);
