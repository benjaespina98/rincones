const mongoose = require("mongoose");

/**
 * Precio comunitario por vino (nombre + uva + bodega normalizados).
 *
 * ── POR QUÉ HAY MUESTRAS Y NO SÓLO UNA SUMA ─────────────────────────────────
 * Esto era un agregado suelto: `sum` y `count`, y cada vez que alguien
 * registraba un precio se sumaba uno a cada campo. Parece suficiente para un
 * promedio y no lo es, porque el aporte no queda atado a NADIE:
 *
 * — Corregís el precio que cargaste mal (9.800 → 12.000) y el pool queda con
 *   count=2. Una sola persona, dos votos, y la ficha anuncia "promedio de 2
 *   personas" sobre un número que ninguna de las dos pagó.
 * — Borrás el vino de tu bodega y tu precio se queda en el promedio para
 *   siempre, sin forma de sacarlo: no había a quién buscarle el aporte.
 * — Y no se podía excluir tu propio precio al mostrar el promedio, que es lo
 *   que hace que "lo que paga la gente" sea de verdad la gente y no vos.
 *
 * Con una muestra por persona los tres casos se arreglan solos: aportar es
 * actualizar TU muestra, retirarla es sacarla de la lista, y `sum/count/min/max`
 * se recalculan desde ahí. Es el mismo patrón que `contributors` en el catálogo
 * comunitario (ver communityWines.service.js).
 *
 * Los agregados se siguen guardando —no se derivan en cada lectura— porque la
 * ficha los pide en cada apertura y leer un documento chico es más barato que
 * recorrer un array; la lista de muestras es la fuente de verdad y ellos, la
 * copia lista para servir.
 */
const winePriceSampleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "ARS" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const winePriceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    // Un precio por persona. La fuente de verdad del pool.
    samples: { type: [winePriceSampleSchema], default: [] },
    // Agregados derivados de `samples`, recalculados en cada escritura.
    sum: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    currency: { type: String, default: "ARS" },
    // Para poder mostrar rango si hiciera falta.
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    name: String,
    winery: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("WinePrice", winePriceSchema);
