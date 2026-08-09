const mongoose = require("mongoose");

// Catálogo comunitario: la identidad de cada vino que cargan los usuarios.
//
// Cuando alguien agrega un vino que no está en el catálogo curado, lo sumamos
// acá (nombre + bodega normalizados) para que aparezca en la búsqueda de todos.
// Sólo guardamos datos públicos del vino (no rating/notas/momentos, que son
// privados de cada usuario). La app se enriquece sola con el uso.
//
// ── POR QUÉ AHORA HAY UN ESTADO Y NO SÓLO UN CONTADOR ───────────────────────
// Antes esto tenía un único `count` que arrancaba en 1, y una fila con count 1
// ya era catálogo público: la buscaba cualquiera y salía RANQUEADA POR ENCIMA de
// lo que devuelve el modelo. O sea que un escaneo mal leído por una sola persona
// —el "Pispi" con bodega "Pispi"— se publicaba con más autoridad que Gemini y no
// había forma de distinguirlo de un dato bueno, ni de corregirlo, ni de saber de
// dónde había salido.
//
// Ahora una fila tiene procedencia y dos umbrales:
//
//   published — ¿se puede buscar? Sí cuando alguien la cargó con una
//               identificación confiable, o cuando DOS personas distintas
//               cargaron lo mismo por su cuenta.
//   verified  — ¿es tan buena como el catálogo curado? Sí cuando hay dos
//               contribuciones independientes y al menos una es confiable.
//
// La diferencia entre los dos umbrales es la que pedía el producto: velocidad
// cuando la lectura es buena, y confirmación cuando no lo es. Una fila creada y
// no publicada no le cuesta nada a nadie —no aparece en ninguna búsqueda— y es
// justo lo que permite que la segunda coincidencia la promueva en vez de nacer
// de cero.
const communityWineSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    winery: { type: String, default: "" },
    region: { type: String, default: "" },
    varietal: { type: String, default: "" },
    type: { type: String, default: "unknown" },
    image: { type: String, default: "" },
    // Cuántas veces se cargó en total (incluye recargas de la misma persona).
    count: { type: Number, default: 1 },

    /**
     * Quiénes lo cargaron, sin repetir.
     *
     * La INDEPENDENCIA es todo el valor de la segunda coincidencia: que la misma
     * persona escanee dos veces la misma botella no confirma nada —si leyó mal la
     * primera, va a leer mal la segunda—. Dos personas distintas llegando al
     * mismo nombre y la misma bodega por su cuenta, sí.
     *
     * Se guarda la lista y no un número porque el número no se puede
     * desduplicar después, y porque al corregir hay que poder sacar a UNA
     * persona sin tocar a las demás.
     */
    contributors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Cuántas de esas contribuciones venían con identificación confiable
    // (ver `identificationVerdict` en data/wineValidation.js).
    trustedCount: { type: Number, default: 0 },

    // De dónde salió: "scan" (foto), "manual" (tipeado), "mixed" (las dos).
    origin: { type: String, enum: ["scan", "manual", "mixed"], default: "scan" },

    // ¿Aparece en las búsquedas? Ver el comentario de arriba.
    published: { type: Boolean, default: false, index: true },

    // ¿Confirmada de forma independiente?
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Índice de texto para búsqueda rápida por nombre/bodega/varietal/región.
communityWineSchema.index({ name: "text", winery: "text", varietal: "text", region: "text" });

module.exports = mongoose.model("CommunityWine", communityWineSchema);
