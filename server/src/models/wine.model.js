const mongoose = require("mongoose");
const { availableFromLots, normalizeLots, reconcileLots } = require("../utils/lots");

/**
 * Un lote es una compra: cuántas botellas entraron, cuándo, y cuántas quedan.
 *
 * `quantity` y `remaining` son dos cosas distintas y ahí está todo el asunto:
 * `quantity` es lo que trajo esa compra y no baja nunca, `remaining` es lo que
 * sigue en la cava. Un lote agotado (`remaining: 0`) se QUEDA en el array: es el
 * registro de qué botellas te tomaste y de dónde salieron. El stock del vino es
 * la suma de los `remaining`; ver `utils/lots.js`.
 *
 * Sin `_id` a propósito: los ajustes de stock reescriben el array desde un
 * pipeline de agregación (para que la cuenta sea atómica) y Mongo no genera
 * ObjectIds ahí. Un lote se identifica por su fecha.
 */
const lotSchema = new mongoose.Schema(
  {
    addedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Cuántas botellas entraron con esta compra. Inmutable salvo devolución.
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    // Cuántas de ésas siguen estando. 0 = lote agotado, que igual se conserva.
    remaining: {
      type: Number,
      required: true,
      min: 0,
    },
    // Cuándo se terminó la última botella de este lote. Sólo en los agotados.
    depletedAt: {
      type: Date,
    },
    // Preparados para cuando la ficha deje registrar qué pagaste por CADA
    // compra —hoy `purchase` guarda una sola, la última—. Nadie los escribe
    // todavía, pero todo el manejo de lotes los conserva si aparecen.
    price: {
      type: Number,
      min: 0,
    },
    store: {
      type: String,
      trim: true,
    },
  },
  { _id: false, versionKey: false }
);

const wineSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El userId es obligatorio"],
    },
    name: {
      type: String,
      required: [true, "El nombre del vino es obligatorio"],
      trim: true,
    },
    winery: {
      type: String,
      trim: true,
    },
    // Gama/línea de la bodega ("Reserva", "Broquel", "Serie A"). Aditivo: los
    // documentos viejos no lo tienen y siguen funcionando — todo lector cae al
    // `name` guardado, que sigue siendo el nombre visible.
    line: {
      type: String,
      trim: true,
      default: "",
    },
    vintage: {
      type: Number,
      min: [1900, "El año debe ser válido"],
      // El año que viene también: las añadas salen a la venta antes de que termine el año (igual que validarVino).
      max: [new Date().getFullYear() + 1, "El año no puede ser futuro"],
    },
    region: {
      type: String,
      trim: true,
    },
    varietal: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },

    /**
     * De dónde salieron los datos de identidad de este vino, y cuánto valen.
     *
     * Existe por una razón concreta: la decisión de publicar un vino en el
     * catálogo compartido se tomaba a ciegas. La confianza por campo que devuelve
     * el lector de etiquetas se usaba sólo para pintar la pantalla de revisión y
     * moría en el navegador, así que en el momento de escribir en la base pública
     * no había forma de distinguir un dato tipeado por una persona de una
     * adivinanza de un modelo chico sobre una foto con brillo.
     *
     * Guardarlo tiene además un uso que no es del alta: cuando aparezca un vino
     * mal cargado, esto dice cómo entró. Sin eso, cada error es un misterio
     * nuevo.
     *
     * Aditivo: los vinos cargados antes no lo tienen y siguen funcionando —todo
     * lector trata la ausencia como "no sabemos", que es la verdad—.
     */
    identification: {
      // "trusted" | "unverified" | "doubtful". Lo calcula el servidor, nunca el
      // cliente: ver `evaluarIdentificacion` en services/wines.service.js.
      verdict: { type: String, enum: ["trusted", "unverified", "doubtful"] },
      // Cómo entró: "scan" (foto), "manual" (tipeado), "ocr" (Tesseract).
      source: { type: String, enum: ["scan", "manual", "ocr", ""] },
      // Qué no cerraba entre los campos al momento de guardar (códigos de
      // data/wineValidation.js). Vacío es lo normal.
      issues: [String],
      // Qué campos tocó la persona en la revisión: la señal más fuerte que hay.
      editedFields: [String],
      // Lo que dijo el modelo, campo por campo (0-100).
      confidence: {
        winery: { type: Number },
        line: { type: Number },
        name: { type: Number },
        varietal: { type: Number },
        vintage: { type: Number },
        region: { type: Number },
        type: { type: Number },
      },
      // La persona confirmó que el vino se llama igual que su bodega (Norton,
      // El Enemigo, Durigutti). Se guarda porque hay que poder volver a
      // aportarlo al catálogo comunitario cuando el vino se edita, sin volver a
      // preguntar lo mismo.
      sameNameConfirmed: { type: Boolean, default: false },
      // Si el catálogo completó huecos, de qué fuente salieron.
      matchedFrom: { type: String, trim: true },
      capturedAt: { type: Date },
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["stock", "tasted", "archived"],
      default: "stock",
    },
    // Stock disponible. Sigue siendo el campo que consultan los filtros, los
    // índices y la UI; `lots` lo desagrega por compra pero no lo reemplaza.
    // Es SIEMPRE la suma de los `remaining` de los lotes (ver el hook de abajo).
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    // El historial completo de compras, del más viejo al más nuevo. Incluye los
    // lotes agotados: el consumo es FIFO y el lote que se vacía queda con
    // `remaining: 0` y `depletedAt`, para poder saber de dónde salió cada
    // botella que ya te tomaste.
    lots: {
      type: [lotSchema],
      default: undefined,
    },
    lastConsumedAt: {
      type: Date,
    },
    // Última vez que sumaste botellas de este vino. `createdAt` sigue siendo la
    // fecha de ingreso a la cava y no se mueve nunca; esto cuenta la reposición
    // más reciente.
    //
    // Con `lots` ya en el modelo, esto quedó como el resumen derivado que se
    // preveía: el detalle de cada compra vive en los lotes y este campo es el
    // atajo para "¿cuándo repusiste por última vez?".
    restockedAt: {
      type: Date,
    },
    consumptionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    tasted: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ["red", "white", "rosé", "sparkling", "fortified", "unknown"],
      default: "unknown",
    },
    // Ficha generada por IA, persistida al crear el vino. Antes se re-pedía en
    // cada apertura de la ficha aunque el modelo ya tenía dónde guardarla.
    description: {
      summary: { type: String, trim: true },
      body: {
        type: String, // Descripción del cuerpo del vino
        trim: true,
      },
      profile: [String], // ["Cuerpo medio", "Taninos suaves"]
      structure: { body: Number, acidity: Number, tannin: Number, sweetness: Number },
      similarTo: [String],
      aromas: [String], // ["cereza", "roble", "especias"]
      foodPairing: [String], // ["carne roja", "queso", "pasta"]
      alcohol: {
        type: Number, // 12.5
        min: 0,
        max: 20,
      },
      serve: { type: String, trim: true }, // "16-18 °C"
      known: { type: Boolean },
      // Una curiosidad sobre la uva, la región o el estilo: lo que se muestra al
      // terminar de escanear y dentro de "Sobre este vino".
      funFact: { type: String, trim: true },
      generatedAt: { type: Date },
    },
    cellar: {
      // "Lugar": dónde vive la botella (ej. "Cava 1", "Heladera").
      location: { type: String, trim: true },
      // "Posición": dónde adentro de ese lugar (ej. "Estante 3"). Separado de
      // `location` y no un solo campo más largo porque son dos preguntas
      // distintas al buscar una botella —primero A DÓNDE ir, después QUÉ
      // estante mirar— y la tarjeta puede mostrar sólo la primera cuando el
      // espacio es chico sin partir un string a la mitad.
      shelf: { type: String, trim: true },
      drinkFrom: { type: Number },
      drinkUntil: { type: Number },
    },

    purchase: {
      price:       { type: Number, min: 0 },
      currency:    { type: String, default: "ARS" },
      store:       { type: String, trim: true },
      purchasedAt: { type: Date },
    },

    image: {
      type: String, // URL de la imagen
      default: null,
    },
    imageSource: {
      type: String,
      enum: ["local", "vivino", "unsplash", "user-upload", "ocr", "community"],
      default: "local",
    },
    rawText: {
      type: String, // Texto extraído por OCR
    },
    moments: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        date: {
          type: Date,
          default: Date.now,
        },
        occasion: {
          type: String,
          enum: [
            "dinner",
            "celebration",
            "gift",
            "tasting",
            "casual",
            "other",
          ],
        },
        companions: [String], // ["Juan", "María"]
        place: String, // "Restaurante La Trattoria"
        emotion: {
          type: String,
          enum: ["happy", "relaxed", "social", "thoughtful", "adventurous"],
        },
        foodPairingActual: String, // Lo que comí con el vino
        notes: String, // Notas personales del momento
        rating: {
          type: Number,
          min: 0,
          max: 5,
        },
        photo: String, // URL de foto del momento (opcional)
        tags: [String], // ["favorito", "recomendado", "no-repeat"]
      },
    ],
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

// Índices para búsquedas rápidas
wineSchema.index({ userId: 1, createdAt: -1 });
wineSchema.index({ userId: 1, name: 1 });
wineSchema.index({ userId: 1, favorite: 1, tasted: 1 });
wineSchema.index({ userId: 1, status: 1, quantity: 1 });
wineSchema.index({ userId: 1, "purchase.purchasedAt": -1 });
// Para `findSameWine`: al cargar un vino hay que saber si ya lo tenés, y la
// cosecha es el único criterio de identidad que es un campo guardado (los otros
// tres los calcula `identityKey`). Filtrar por acá evita traer la colección
// entera en cada alta, que es el camino crítico del escaneo.
wineSchema.index({ userId: 1, vintage: 1 });

// Keep `updatedAt` fresh
wineSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

/**
 * La invariante `quantity === suma de los remaining`, sostenida en cada `save()`.
 *
 * Los updates atómicos ya la garantizan por su lado (los pipelines de
 * `utils/lots.js` recalculan quantity desde los lotes en el mismo paso). Este
 * hook cubre el otro camino: todo el código que trabaja con el documento en
 * memoria —crear un vino, editar la cantidad a mano desde la ficha— y que
 * escribe `quantity` sin saber que existen los lotes.
 *
 * Quién manda depende de qué tocaron:
 *  - no hay lotes todavía (vino nuevo, o anterior a esta versión) → se deriva
 *    el lote inicial de `quantity` + `createdAt`, igual que la migración;
 *  - tocaron `quantity` y no los lotes → los lotes se acomodan (FIFO al bajar,
 *    lote nuevo al subir): es lo que espera quien escribe un número en la ficha;
 *  - en cualquier otro caso mandan los lotes y `quantity` sale de su suma.
 *
 * Va en `validate` y no en `save` para que el `min: 0` del esquema se valide
 * sobre los valores ya reconciliados.
 */
wineSchema.pre("validate", function () {
  const lotes = Array.isArray(this.lots) ? this.lots : [];
  const cantidad = Number(this.quantity) || 0;

  if (lotes.length === 0) {
    this.lots = normalizeLots([], { quantity: cantidad, createdAt: this.createdAt });
    this.quantity = availableFromLots(this.lots);
    return;
  }

  if (this.isModified("quantity") && !this.isModified("lots")) {
    this.lots = reconcileLots(lotes, cantidad, { createdAt: this.createdAt });
  } else {
    this.lots = normalizeLots(lotes, { createdAt: this.createdAt });
  }

  this.quantity = availableFromLots(this.lots);
});

/**
 * Acá vivía `wineSchema.methods.addMoment`, que escribía en el array `moments`
 * de arriba. Estaba MUERTO y era peligroso justamente por eso.
 *
 * Los momentos viven en su propia colección (`models/wineMoment.model.js`) y los
 * escribe `addMoment` en `services/wines.service.js`. Eran dos funciones con el
 * mismo nombre guardando en lugares distintos: nada llamaba a ésta, pero
 * cualquiera que hiciera `wine.addMoment(...)` —que es lo que uno escribiría al
 * ver el método en el modelo— habría guardado el momento donde ningún lector lo
 * busca. El diario del usuario se habría perdido en silencio.
 *
 * Se verificó contra la base antes de sacarlo: cero vinos con momentos en el
 * array embebido.
 */

// Static: aggregate useful stats for a user (used by profile endpoint)
wineSchema.statics.getUserStats = async function (userId) {
  const ObjectId = mongoose.Types.ObjectId;
  const userObjectId = new ObjectId(userId);

  const agg = await this.aggregate([
    { $match: { userId: userObjectId } },
    {
      $facet: {
        countsByType: [
          { $group: { _id: "$type", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        // Uva + tipo de cada una: el perfil muestra «20 Malbec, 3 Sauvignon Blanc» coloreado por tipo, no sólo tinto/blanco.
        countsByVarietal: [
          { $match: { varietal: { $nin: [null, ""] } } },
          { $group: { _id: { varietal: "$varietal", type: "$type" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 60 },
        ],
        topVarietals: [
          { $group: { _id: "$varietal", count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        topRegions: [
          { $group: { _id: "$region", count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        // Sólo los puntuados. Promediando TODOS, cada vino sin puntuar entraba
        // como un cero: con 62 vinos y 20 puntuados el promedio daba 1.0, un
        // número que no describe a nadie.
        // El `count` viaja al lado del promedio y sale de la misma etapa que ya
        // corría: es cuántos vinos puntuaste, que es lo que necesita el perfil
        // para decir "23 vinos puntuados" en la fila de valoraciones. Sin esto
        // había que pedir la lista entera de reseñas —con sus textos— sólo para
        // contar cuántas son.
        avgRating: [
          { $match: { rating: { $gt: 0 } } },
          { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
        ],
        /**
         * Tres datos que no salían de ningún lado y que el contenido educativo
         * necesita para poder hablar de TU bodega en vez de en general: qué
         * añadas tenés, cuántos cortes y qué tan lejos está tu botella más cara
         * de la más barata.
         *
         * Van acá y no en una consulta nueva: es la misma agregación que ya
         * corre, en el mismo `$facet`, y la alternativa era que Descubrí pidiera
         * la bodega entera —doscientos vinos completos— para calcular tres
         * números en el navegador.
         */
        vintages: [
          { $match: { vintage: { $gt: 0 } } },
          { $group: { _id: null, min: { $min: "$vintage" }, max: { $max: "$vintage" }, count: { $sum: 1 } } },
        ],
        blends: [
          { $match: { varietal: { $regex: /blend|corte/i } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        prices: [
          { $match: { "purchase.price": { $gt: 0 } } },
          { $group: { _id: null, min: { $min: "$purchase.price" }, max: { $max: "$purchase.price" }, count: { $sum: 1 } } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              // Cuántos vinos DISTINTOS tenés con botellas. Se cuenta por
              // `quantity`, que es la única fuente de verdad del stock (la
              // sostiene la invariante de `utils/lots.js`), y NO por `status`.
              //
              // Contando por status faltaba la mitad de la bodega: `toWineStatus`
              // manda a un vino con botellas a "tasted" en cuanto lo probaste una
              // vez, así que todo lo que abriste alguna vez y todavía tenés
              // quedaba fuera de la cuenta. Alcanzaba con probar tu único vino
              // para que la home dijera "Ya no te queda nada en stock" con la
              // botella abierta al lado. Es el mismo error que ya se había
              // corregido en `consumed`, en la línea de abajo.
              stock: { $sum: { $cond: [{ $gt: ["$quantity", 0] }, 1, 0] } },
              // Botellas, no vinos: dos cosas distintas que los textos venían
              // mezclando ("te queda una botella" cuando quedaba un vino con
              // seis). Quien escribe copy necesita el número que va a decir.
              bottles: { $sum: { $ifNull: ["$quantity", 0] } },
              // Se cuenta por el campo `tasted`, no por `status`. Al terminar
              // la última botella `toWineStatus` pasa el vino a "archived", así
              // que contando por status un vino que te tomaste entero dejaba de
              // figurar entre tus probados justamente cuando más lo probaste.
              consumed: { $sum: { $cond: [{ $eq: ["$tasted", true] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]).exec();

  const out = agg && agg[0] ? agg[0] : {};

  const primero = (clave) => (out[clave] && out[clave][0]) || null;
  const vintages = primero("vintages");
  const prices = primero("prices");

  return {
    countsByType: (out.countsByType || []).map((r) => ({ type: r._id || 'unknown', count: r.count })),
    countsByVarietal: (out.countsByVarietal || []).map((r) => ({
      varietal: r._id?.varietal || "",
      type: r._id?.type || "unknown",
      count: r.count,
    })),
    topVarietals: (out.topVarietals || []).map((r) => ({ varietal: r._id, count: r.count })),
    topRegions: (out.topRegions || []).map((r) => ({ region: r._id, count: r.count })),
    avgRating: out.avgRating && out.avgRating[0] ? Number((out.avgRating[0].avgRating || 0).toFixed(2)) : 0,
    ratedCount: (out.avgRating && out.avgRating[0]?.count) || 0,
    totals: out.totals && out.totals[0] ? out.totals[0] : { total: 0, stock: 0, bottles: 0, consumed: 0 },
    // Los tres de arriba, ya en la forma que consume el contenido educativo.
    // Siempre presentes y en cero cuando no hay datos: quien los lee no tiene
    // que preguntar si existen, sólo si alcanzan.
    vintages: vintages
      ? { min: vintages.min, max: vintages.max, count: vintages.count }
      : { min: 0, max: 0, count: 0 },
    blends: primero("blends")?.count || 0,
    prices: prices
      ? { min: prices.min, max: prices.max, count: prices.count }
      : { min: 0, max: 0, count: 0 },
  };
};

module.exports = mongoose.model("Wine", wineSchema);
