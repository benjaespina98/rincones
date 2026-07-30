const mongoose = require("mongoose");

/**
 * Un evento de uso de la app: una visita a una pantalla, un clic en un
 * destacado, un vino cargado.
 *
 * ── QUÉ NO GUARDA, Y POR QUÉ ────────────────────────────────────────────────
 * No guarda IP, ni user-agent, ni nada con lo que se pueda volver a la persona.
 * Lo que identifica a un visitante es `visitorHash`: un SHA-256 de
 * (IP + user-agent + un secreto del servidor) que se calcula al recibir el
 * evento y del que no se puede volver atrás sin el secreto. Alcanza para contar
 * "cuánta gente entró" sin construir un perfil de nadie, y es la razón por la
 * que esto no necesita cartel de cookies: no hay cookie ni almacenamiento en el
 * dispositivo del visitante.
 *
 * `userId` sí se guarda cuando la persona está con sesión abierta, porque en ese
 * caso ya sos un usuario identificado de tu propia app y saber qué usa es el
 * punto. Es opcional: los visitantes anónimos son justamente los que hay que
 * poder contar.
 *
 * ── POR QUÉ EVENTOS CRUDOS Y NO SÓLO CONTADORES ─────────────────────────────
 * Un contador responde la pregunta que ya te hiciste; los eventos crudos
 * responden la que se te va a ocurrir en tres meses ("¿la gente que entra por
 * Descubrí carga vinos?"). El costo es tamaño, y para eso está el TTL: los
 * eventos se borran solos a los 180 días. Los totales históricos que hay que
 * conservar más allá de eso viven en el rollup diario (analyticsDaily.model.js).
 */
const analyticsEventSchema = new mongoose.Schema(
  {
    // Qué pasó. Abierto a propósito (no un enum): sumar un evento nuevo desde el
    // cliente no puede requerir un deploy del server para que no lo rechace.
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    // Pantalla donde pasó, ya normalizada (los ids se reemplazan por ":id", así
    // que /vino/687f… agrupa con el resto en /vino/:id en vez de ser una fila
    // distinta por cada vino de cada usuario).
    path: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    // Día en formato YYYY-MM-DD, en UTC. Redundante con `createdAt`, y a
    // propósito: es lo que permite contar visitantes únicos por día con un solo
    // $group en vez de proyectar fechas en cada consulta.
    //
    // UTC y no la zona de Argentina: el corte del día queda a las 21:00 local, así
    // que lo que pase entre esa hora y la medianoche cuenta al día siguiente. Es
    // una distorsión conocida y aceptada —para leer tendencias da igual—, pero hay
    // que saberla antes de sacar conclusiones de un día puntual.
    day: {
      type: String,
      required: true,
      index: true,
    },
    visitorHash: {
      type: String,
      required: true,
    },
    // Una sesión de navegación (se renueva a los 30 minutos de inactividad).
    // Sirve para separar "diez visitas" de "una persona mirando diez pantallas".
    sessionHash: {
      type: String,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Contexto del evento: para un clic en un destacado, cuál. Libre y acotado
    // en tamaño; nunca datos personales.
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // De qué tipo de pantalla vino, para poder separar celular de escritorio sin
    // guardar el user-agent entero.
    device: {
      type: String,
      enum: ["mobile", "desktop", "unknown"],
      default: "unknown",
    },
    // De dónde llegó (el host del referrer, no la URL completa: alcanza para
    // saber si vino de Instagram y no expone qué estaba mirando).
    referrer: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Las consultas del panel son siempre "tal rango de días, tal tipo de evento".
analyticsEventSchema.index({ day: 1, type: 1 });
analyticsEventSchema.index({ day: 1, visitorHash: 1 });
analyticsEventSchema.index({ type: 1, createdAt: -1 });

// Los eventos crudos se borran solos a los 180 días: el detalle sirve para
// mirar de cerca lo reciente, y lo que hay que conservar para siempre son los
// totales, que viven en el rollup diario.
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
