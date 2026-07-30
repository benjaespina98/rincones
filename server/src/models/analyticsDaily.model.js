const mongoose = require("mongoose");

/**
 * El resumen de un día, que no se borra nunca.
 *
 * Existe por dos razones:
 *
 *  1. PERMANENCIA. Los eventos crudos caducan a los 180 días (ver
 *     analyticsEvent.model.js). Sin este rollup, en un año no habría forma de
 *     responder "¿crecimos?", que es la única pregunta que de verdad importa a
 *     largo plazo.
 *
 *  2. VISITANTES ÚNICOS. Contar únicos no se puede sumar después: si el lunes
 *     entraron 10 y el martes 10, el total de la semana no es 20 (puede ser 10
 *     personas entrando dos veces). El único momento en que se puede contar bien
 *     es dentro del día, con los hashes a la vista. Acá queda ese número ya
 *     resuelto.
 *
 * Se actualiza de forma incremental en cada evento con `$inc` y `$addToSet`: no
 * hay tarea nocturna que pueda quedar sin correr, y el panel lee números ya
 * calculados en vez de recorrer la colección de eventos.
 *
 * ── LÍMITE CONOCIDO DE LOS SETS ─────────────────────────────────────────────
 * `visitors`, `sessionHashes` y `loggedInVisitors` guardan un hash por visitante
 * del día y crecen mientras el día dure. NO se recortan: hoy no hay ninguna tarea
 * que lo haga, y decir lo contrario sería describir algo que no existe.
 *
 * Con el tráfico de una app personal esto es irrelevante (32 caracteres por
 * visitante: mil visitantes son ~32 KB). Empieza a molestar en el orden de las
 * decenas de miles de visitantes por día, porque `$addToSet` recorre el array
 * entero en cada evento y el documento tiene un techo de 16 MB.
 *
 * El día que ese volumen sea un problema real, el reemplazo es un HyperLogLog
 * (cuenta únicos en un espacio fijo, con ~2% de error) o vaciar los sets al
 * cerrar el día y quedarse con los contadores, que es lo único que se lee a
 * largo plazo. Anotado en el PR como deuda; hasta entonces, esto es más simple y
 * exacto.
 */
const analyticsDailySchema = new mongoose.Schema(
  {
    // YYYY-MM-DD. Es la clave: un documento por día.
    day: {
      type: String,
      required: true,
      unique: true,
    },
    // Visitas a pantallas (pageviews): cuántas veces se abrió una pantalla.
    views: {
      type: Number,
      default: 0,
    },
    // Sesiones: visitas agrupadas por "alguien usando la app un rato".
    sessions: {
      type: Number,
      default: 0,
    },
    // Cuánta gente distinta entró ese día. Es el número de la pregunta original.
    visitorCount: {
      type: Number,
      default: 0,
    },
    // Cuántos de esos visitantes tenían sesión abierta.
    loggedIn: {
      type: Number,
      default: 0,
    },
    // ── Los sets de los que salen los tres contadores de arriba ──────────────
    // Personas, sesiones y logueados no se pueden sumar visita por visita (la
    // misma persona abriendo diez pantallas es UNA persona). Estos sets son la
    // única fuente con la que esos números salen bien; los contadores de arriba
    // son su tamaño, materializado para no tener que traer los hashes al panel
    // y para que el dato siga estando si algún día estos sets se vacían.
    //
    // `select: false`: no se leen nunca por accidente. Son hashes anónimos, pero
    // no hay razón para que salgan de acá.
    visitors: {
      type: [String],
      default: [],
      select: false,
    },
    sessionHashes: {
      type: [String],
      default: [],
      select: false,
    },
    loggedInVisitors: {
      type: [String],
      default: [],
      select: false,
    },
    mobile: {
      type: Number,
      default: 0,
    },
    desktop: {
      type: Number,
      default: 0,
    },
    // Contadores por tipo de evento y por pantalla. Objetos libres (`Mixed`) y no
    // `Map`: se actualizan con `$inc` sobre rutas con punto ("byType.pageview"),
    // y Mongoose castea eso a un Map de forma inconsistente. Con `Mixed` la
    // operación llega tal cual a Mongo, que es lo que hace falta.
    //
    // Sumar un tipo de evento nuevo no requiere migrar nada: aparece la clave.
    byType: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    byPath: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

analyticsDailySchema.index({ day: -1 });

module.exports = mongoose.model("AnalyticsDaily", analyticsDailySchema);
