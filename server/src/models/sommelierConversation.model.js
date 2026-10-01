const mongoose = require("mongoose");

/**
 * Las conversaciones con la guía de vino, guardadas por persona.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * La charla vivía en `sessionStorage`: sobrevivía a cambiar de pestaña dentro
 * de la app, y nada más. Cerrar el navegador la borraba. Eso estaba bien
 * pensado para lo que era —que volver a la pantalla no te dejara en cero— pero
 * deja afuera lo que la gente pide después: "¿qué me habías dicho para el
 * asado?". Una respuesta que costó una llamada al modelo y que la persona leyó
 * una vez se tira a los cinco minutos.
 *
 * ── NO REEMPLAZA A sessionStorage, LO COMPLEMENTA ───────────────────────────
 * La conversación EN CURSO sigue viviendo en el cliente. Abrir el Sommelier
 * sigue empezando en blanco, que es la decisión de antes y sigue siendo la
 * correcta: nadie quiere que la app arranque con la charla de la semana pasada
 * abierta. Esto es el archivo, y se entra a propósito.
 *
 * ── POR QUÉ NO SE GUARDA EL VINO ENTERO ─────────────────────────────────────
 * Las respuestas traen botellas, y guardar el documento completo de cada una
 * tendría dos problemas: el tamaño (una conversación larga con veinte vinos
 * pesaría más que la charla) y sobre todo que envejece — el stock, el puntaje y
 * la foto cambian, y el historial mostraría datos viejos con cara de actuales.
 * Se guarda lo mínimo para dibujar la tarjeta y el id para ir a la ficha, que
 * es la que tiene la verdad.
 *
 * ── RETENCIÓN ───────────────────────────────────────────────────────────────
 * 180 días. No es por espacio: una recomendación de maridaje no caduca, pero el
 * catálogo y los precios sí, y a partir de cierto punto el historial deja de
 * ser útil y pasa a ser un archivo de datos personales que nadie va a leer.
 * Guardar menos es también no tener que cuidar más.
 */

/** Lo justo para dibujar una tarjeta de vino sin congelar sus datos. */
const vinoResumidoSchema = new mongoose.Schema(
  {
    // El id apunta a la fuente de verdad: la tarjeta lleva a la ficha y ahí se
    // ve el stock y el puntaje de hoy, no el del día de la charla.
    wineId: { type: String },
    name: { type: String },
    winery: { type: String },
    type: { type: String },
    image: { type: String },
  },
  { _id: false }
);

const mensajeSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },
    // Sólo en las del asistente. `deTuBodega` son los que la persona tiene;
    // `paraDescubrir`, los del catálogo.
    deTuBodega: { type: [vinoResumidoSchema], default: [] },
    paraDescubrir: { type: [vinoResumidoSchema], default: [] },
    repreguntas: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const sommelierConversationSchema = new mongoose.Schema(
  {
    // Índice compuesto con `updatedAt` más abajo: la consulta que importa es
    // siempre "las últimas de esta persona", nunca "todas las de todos".
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /**
     * El título es la primera pregunta, recortada.
     *
     * No se le pide al modelo que invente uno: costaría otra llamada por
     * conversación para algo que la persona ya escribió con sus palabras, y
     * "¿Qué tomo con un asado?" identifica la charla mejor que cualquier
     * resumen generado.
     */
    title: { type: String, required: true, maxlength: 120 },
    messages: { type: [mensajeSchema], default: [] },
    createdAt: { type: Date, default: Date.now, expires: 180 * 24 * 60 * 60 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

// "Las últimas charlas de esta persona": userId para filtrar, updatedAt
// descendente para ordenar. Sin el índice compuesto, Mongo filtra por usuario y
// después ordena en memoria todas las que encontró.
sommelierConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("SommelierConversation", sommelierConversationSchema);
