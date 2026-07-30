const mongoose = require("mongoose");

/**
 * Un destacado de la pantalla Descubrí: una publicidad paga o un evento real.
 *
 * ── POR QUÉ NO ES OTRO ÍTEM DE discoverContent.js ───────────────────────────
 * El contenido de "Aprendé y explorá" es curaduría: está ahí porque vale la
 * pena. Una publicidad está ahí porque alguien pagó. Son dos cosas distintas y
 * mezclarlas es lo que hace que una app se sienta poco confiable —el usuario deja
 * de saber si una recomendación es una recomendación—. Por eso viven separados,
 * y por eso `sponsored` obliga a mostrar el cartel de "Publicidad": no es un
 * detalle legal molesto, es lo que mantiene creíble a todo lo demás.
 *
 * ── LO QUE HACE QUE ESTO SIRVA EL DÍA QUE HAYA UN ANUNCIANTE ────────────────
 *  - Ventana de vigencia (`startsAt`/`endsAt`): una campaña se apaga sola el día
 *    que termina. Nadie tiene que acordarse de bajarla un domingo.
 *  - `priority`: quién va primero cuando hay varias. Sin esto el orden lo decide
 *    el azar del índice, que es indefendible frente a quien pagó.
 *  - `impressions` / `clicks`: lo primero que pregunta un anunciante. Si no se
 *    cuentan desde el principio, el primer mes no tiene números.
 *  - `active`: bajar algo YA, sin borrarlo ni perder sus métricas.
 */
const promotionSchema = new mongoose.Schema(
  {
    // "ad" es espacio pago; "event" es un evento real (propio o de un tercero).
    // Cambia el cartel y cómo se ordena: un evento con fecha próxima gana
    // relevancia sola, una publicidad vale por lo que se pactó.
    kind: {
      type: String,
      enum: ["ad", "event"],
      default: "event",
      required: true,
    },
    title: {
      type: String,
      required: [true, "El título es obligatorio"],
      trim: true,
      maxlength: 90,
    },
    // Una línea. El límite es a propósito: en una tarjeta de celular, más texto
    // no se lee — se saltea.
    summary: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    // Imagen de fondo (URL). Opcional: sin ella la tarjeta usa un degradado con
    // el color de acento, que es preferible a un hueco roto.
    image: {
      type: String,
      trim: true,
      default: "",
    },
    // A dónde lleva. Externa (sitio del anunciante) o interna (/descubrir/...).
    url: {
      type: String,
      trim: true,
      default: "",
    },
    ctaLabel: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    // Quién lo publica. En una publicidad es obligatorio en la práctica: el
    // usuario tiene derecho a saber de quién es el mensaje.
    sponsor: {
      name: { type: String, trim: true, maxlength: 60, default: "" },
      logo: { type: String, trim: true, default: "" },
    },
    /**
     * Si esto es espacio pago. Lo fuerza el hook de abajo cuando `kind` es "ad":
     * que una publicidad se muestre sin cartel no puede depender de que alguien
     * se acuerde de tildar una casilla.
     */
    sponsored: {
      type: Boolean,
      default: false,
    },
    // Color de acento de la tarjeta, para que una campaña pueda respetar la
    // identidad del anunciante sin que haya que tocar el CSS.
    accent: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    // Cuándo se muestra. `startsAt` vacío = desde ya; `endsAt` vacío = hasta que
    // lo bajes a mano.
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // Cuándo ES el evento (distinto de cuándo se muestra la tarjeta: una feria de
    // octubre se promociona desde agosto).
    eventAt: { type: Date, default: null },
    place: {
      city: { type: String, trim: true, maxlength: 60, default: "" },
      venue: { type: String, trim: true, maxlength: 80, default: "" },
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Mayor va primero.
    priority: {
      type: Number,
      default: 0,
    },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// La consulta pública es siempre la misma: lo activo y vigente, por prioridad.
promotionSchema.index({ active: 1, startsAt: 1, endsAt: 1, priority: -1 });

promotionSchema.pre("save", function () {
  this.updatedAt = new Date();
});

/**
 * Una publicidad se declara publicidad. No es opcional y no depende de que
 * alguien tilde una casilla en el panel.
 *
 * Va en `validate` y no en `save` por la misma razón que el hook de lotes de
 * wine.model.js: `validate` corre como parte de cualquier `save()`, así que cubre
 * los mismos caminos, y además deja la regla comprobable sin una base de datos
 * de por medio. Una invariante que sólo se puede testear con Mongo levantado es
 * una invariante que en la práctica nadie testea.
 */
promotionSchema.pre("validate", function () {
  if (this.kind === "ad") this.sponsored = true;
});

module.exports = mongoose.model("Promotion", promotionSchema);
