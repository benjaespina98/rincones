const mongoose = require("mongoose");

/**
 * Un día en la vida de una campaña: cuántas veces se mostró, cuánta gente
 * distinta la vio y cuántos la tocaron.
 *
 * ── POR QUÉ NO ALCANZA CON LOS CONTADORES DE LA CAMPAÑA ─────────────────────
 * El acumulado responde "cuánto anduvo en total". No responde nada de lo que
 * pregunta alguien que paga: cómo viene esta semana contra la anterior, qué pasó
 * el día que salió la promo, cuánto rindió el mes que factura. Y una vez que el
 * total pasó, esa información no se puede reconstruir: hay que escribirla el día
 * que ocurre.
 *
 * ── POR QUÉ ES UNA COLECCIÓN Y NO UN ARRAY DENTRO DE LA CAMPAÑA ─────────────
 * Una campaña de un año son 365 subdocumentos que se leen enteros cada vez que se
 * toca la tarjeta, y el documento crece sin techo hasta chocar con el límite de
 * 16MB. Una fila por (campaña, día) crece lineal, se indexa y se consulta por
 * rango sin traer el resto.
 *
 * ── POR QUÉ NO CADUCA ───────────────────────────────────────────────────────
 * A diferencia de los eventos crudos de analytics (que se borran a los 180 días),
 * esto es el respaldo de lo que se le informó a un anunciante. Es chico —una fila
 * por campaña por día— y es justo lo que hay que poder mostrar cuando alguien
 * discute una factura seis meses después.
 */
const promotionStatSchema = new mongoose.Schema(
  {
    promotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      required: true,
    },
    // YYYY-MM-DD en día calendario argentino, no UTC. A diferencia de analytics
    // —donde el corte en UTC es una distorsión aceptada para leer tendencias—, acá
    // el día tiene que coincidir con el que el anunciante ve en su calendario: si
    // no, "el lunes tuve 300 impresiones" no es comprobable contra nada.
    day: {
      type: String,
      required: true,
    },
    // Veces que la tarjeta se mostró.
    impressions: { type: Number, default: 0 },
    // Personas distintas que la vieron ese día. Sale de promotionView.model.js:
    // no es una fracción de `impressions`, es su propio conteo.
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    // Personas distintas que la tocaron ese día. Es el numerador honesto de la
    // efectividad: `reach` es el denominador y los dos cuentan gente.
    clickReach: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/**
 * Una sola fila por campaña y día, garantizado por la base.
 *
 * Es lo que permite escribir con un `upsert` + `$inc` sin leer nada antes. Sin el
 * índice único, dos visitantes simultáneos crean dos filas del mismo día y el
 * total se parte en dos sin que nada falle: el número queda mal para siempre y no
 * hay ningún error en ningún log.
 */
promotionStatSchema.index({ promotion: 1, day: 1 }, { unique: true });
// Para el panel: "cómo vinieron todas las campañas en los últimos 30 días".
promotionStatSchema.index({ day: 1 });

module.exports = mongoose.model("PromotionStat", promotionStatSchema);
