const mongoose = require("mongoose");

const cachedPlaceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: "" },
    rating: { type: Number, default: null },
    distance: { type: Number, default: null },
    source: { type: String, default: "foursquare" },
    rawCategory: { type: String, default: "" },
  },
  { _id: false }
);

const placeCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    radius: { type: Number, required: true },
    category: { type: String, default: "all" },
    places: { type: [cachedPlaceSchema], default: [] },
    source: { type: String, default: "foursquare" },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("PlaceCache", placeCacheSchema);