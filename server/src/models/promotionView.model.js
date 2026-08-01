const mongoose = require("mongoose");

/**
 * Una marca de "esta persona ya vio esta campaña hoy".
 *
 * ── LA DEUDA QUE ESTO PAGA ──────────────────────────────────────────────────
 * Las impresiones se contaban con un `$inc` por cada vez que la tarjeta aparecía
 * en pantalla, sin deduplicar. Eso servía para tener una idea, pero no para
 * facturar: la misma persona abriendo Descubrí diez veces sumaba diez, y el número
 * que se le informaba a un anunciante decía "diez personas vieron tu campaña"
 * cuando la había visto una. Un número inflado no es un número optimista: es un
 * número que, si el anunciante lo audita, deja sin credibilidad a todo el resto.
 *
 * Ahora se cuentan las dos cosas por separado y cada una dice lo que dice:
 * `impressions` = veces mostrada, `reach` = personas distintas. Este documento es
 * lo que hace posible el segundo número.
 *
 * ── CÓMO SE SABE QUIÉN ES SIN SABER QUIÉN ES ────────────────────────────────
 * `visitorHash` es el mismo hash anónimo de las métricas de uso: sha256 de
 * (IP + user-agent + un secreto del server), calculado al recibir el evento. La IP
 * no toca la base y sin el secreto no se puede volver atrás. Alcanza para no
 * contar dos veces a la misma persona y no construye el perfil de nadie, que es la
 * razón por la que esto no necesita cartel de cookies.
 *
 * Sus límites, dichos de frente: dos personas en la misma casa con el mismo
 * teléfono cuentan como una, y la misma persona en wifi y en datos cuenta como
 * dos. Es una aproximación honesta de "cuánta gente distinta", y hay que
 * presentarla como eso.
 *
 * ── POR QUÉ UN DOCUMENTO POR VISITA Y NO UN SET ─────────────────────────────
 * Guardar los hashes en un array dentro de la fila diaria haría crecer ese
 * documento con cada visitante hasta chocar con el límite de 16MB, y con miles de
 * visitantes cada escritura reescribiría el array entero. Una fila chica por
 * (campaña, persona, día), con índice único, convierte el problema en "insertar e
 * ignorar si ya estaba": costo constante y sin documentos que crecen.
 */
const promotionViewSchema = new mongoose.Schema(
  {
    promotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      required: true,
    },
    day: { type: String, required: true },
    visitorHash: { type: String, required: true },
    /**
     * Si esta persona además la tocó ese día.
     *
     * Es lo que permite contar CLICS DE GENTE DISTINTA y no sólo clics. Sin esto,
     * el panel dividía clics sin deduplicar sobre impresiones deduplicadas por
     * visita, y el resultado era una "efectividad" del 130%: un número que no
     * puede existir y que delata que arriba y abajo de la fracción se estaban
     * contando cosas distintas.
     */
    clicked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/**
 * El índice único ES el mecanismo de deduplicación.
 *
 * No se pregunta "¿ya vio esto?" y después se inserta: se inserta y la base
 * rechaza el duplicado. Preguntar primero tiene una carrera obvia —dos pestañas
 * abiertas a la vez pasan las dos la pregunta y suman dos— y cuesta una lectura
 * extra por tarjeta y por visita. Acá el conteo de personas distintas es
 * exactamente "cuántas inserciones entraron", que no se puede inflar ni siquiera
 * con concurrencia.
 */
promotionViewSchema.index({ promotion: 1, day: 1, visitorHash: 1 }, { unique: true });

/**
 * Se borran solas a los 45 días.
 *
 * Son un mecanismo de deduplicación con ventana de un día, no un archivo: pasado
 * el día ya no cumplen ninguna función. El número que hay que conservar —cuánta
 * gente distinta vio la campaña ese día— quedó materializado en
 * promotionStat.model.js, que no caduca. Los 45 días son margen para poder
 * recalcular un mes cerrado si hiciera falta auditarlo.
 */
promotionViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

module.exports = mongoose.model("PromotionView", promotionViewSchema);
