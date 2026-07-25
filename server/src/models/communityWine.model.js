const mongoose = require("mongoose");

// Catálogo comunitario: la identidad de cada vino que cargan los usuarios.
//
// Cuando alguien agrega un vino que no está en el catálogo curado, lo sumamos
// acá (nombre + bodega normalizados) para que aparezca en la búsqueda de todos.
// Sólo guardamos datos públicos del vino (no rating/notas/momentos, que son
// privados de cada usuario). La app se enriquece sola con el uso.
const communityWineSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    winery: { type: String, default: "" },
    region: { type: String, default: "" },
    varietal: { type: String, default: "" },
    type: { type: String, default: "unknown" },
    image: { type: String, default: "" },
    // Cuántos usuarios lo cargaron (proxy de popularidad / confianza).
    count: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// Índice de texto para búsqueda rápida por nombre/bodega/varietal/región.
communityWineSchema.index({ name: "text", winery: "text", varietal: "text", region: "text" });

module.exports = mongoose.model("CommunityWine", communityWineSchema);
