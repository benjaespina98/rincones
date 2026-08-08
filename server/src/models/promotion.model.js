const mongoose = require("mongoose");
const {
  parseFecha,
  urlSegura,
  imagenSegura,
  colorSeguro,
} = require("../utils/promotionState");

/**
 * Un contenido publicado desde el panel: un evento, una vinoteca, una bodega.
 * Pago o no.
 *
 * ── DE "PUBLICIDAD O EVENTO" A "QUÉ ES + SI ES PAGO" ────────────────────────
 * Antes había `kind: "ad" | "event"`, y "ad" forzaba `sponsored`. Eso mezclaba
 * dos preguntas independientes en un solo campo: QUÉ ES esto (un evento, una
 * tienda) y SI ALGUIEN PAGÓ para que esté acá. Con ese diseño, una publicidad no
 * podía ser nada en particular —era "ad" y punto—, así que no había forma de
 * mandarla a la sección que le corresponde en la pantalla; y un evento
 * auspiciado tenía que elegir entre declararse pago o declararse evento.
 *
 * Ahora son dos campos:
 *   · `type`     — qué es. Decide en qué sección de Descubrí aparece y con qué
 *                  ícono, rótulo y forma de tarjeta.
 *   · `sponsored` — si es espacio pago. Independiente del tipo: CUALQUIER
 *                  contenido puede ser patrocinado sin que exista un tipo
 *                  "publicidad" aparte.
 *
 * ── POR QUÉ NO ES OTRO ÍTEM DE discoverContent.js ───────────────────────────
 * El contenido de "Aprendé y explorá" es curaduría: está ahí porque vale la
 * pena. Algo patrocinado está ahí porque alguien pagó. Son dos cosas distintas y
 * mezclarlas es lo que hace que una app se sienta poco confiable —el usuario deja
 * de saber si una recomendación es una recomendación—. Por eso viven separados,
 * y por eso `sponsored` obliga a mostrar el cartel de "Publicidad": no es un
 * detalle legal molesto, es lo que mantiene creíble a todo lo demás.
 *
 * ── LO QUE HACE QUE ESTO SIRVA FRENTE A ALGUIEN QUE PAGA ────────────────────
 *  - Ventana de vigencia (`startsAt`/`endsAt`): la campaña se apaga sola el día
 *    que termina. Nadie tiene que acordarse de bajarla un domingo. Y se lee en
 *    día calendario argentino, así que "hasta el 31" incluye el 31 completo (ver
 *    utils/promotionState.js: parseFecha).
 *  - `priority`: quién va primero cuando hay varias. Sin esto el orden lo decide
 *    el azar del índice, que es indefendible frente a quien pagó.
 *  - `active`: bajarla YA, sin borrarla ni perder sus métricas.
 *  - Contadores acumulados acá + serie diaria en promotionStat.model.js. El
 *    número de la vida de la campaña se lee sin agregación, y la evolución día
 *    por día está cuando hay que justificar una factura.
 *
 * ── LO QUE SE VALIDA, Y POR QUÉ NO ALCANZA CON CONFIAR EN EL PANEL ──────────
 * Las URLs, el color y la coherencia de la ventana se validan EN EL MODELO. El
 * panel también lo hace, pero el panel es una conveniencia: el server es el único
 * lugar por el que pasa todo, hoy con un administrador cargando a mano y mañana
 * con una integración o un formulario de autogestión del anunciante.
 */
const promotionSchema = new mongoose.Schema(
  {
    /**
     * QUÉ es este contenido. Decide en qué sección de Descubrí cae:
     *
     *   wineShop  → "Dónde comprar" (vinotecas y tiendas)
     *   event     → "Eventos destacados" si hay imagen y fecha; si no, al feed
     *   winery    → bodegas para conocer, en el feed
     *   article   → notas y lecturas, en el feed
     *   course    → cursos y certificaciones, en el feed
     *   video     → catas y guías en video, en el feed
     *
     * NO existe un tipo "publicidad": eso es `sponsored`, que es ortogonal. Una
     * vinoteca paga y una vinoteca recomendada son las dos `wineShop` y van a la
     * misma sección; lo único que cambia es el badge.
     */
    type: {
      type: String,
      enum: ["event", "wineShop", "winery", "article", "course", "video"],
      default: "event",
      required: true,
    },
    title: {
      type: String,
      required: [true, "El título es obligatorio"],
      trim: true,
      maxlength: [90, "El título no puede pasar de 90 caracteres"],
    },
    // Una línea. El límite es a propósito: en una tarjeta de celular, más texto
    // no se lee — se saltea.
    summary: {
      type: String,
      trim: true,
      maxlength: [160, "La bajada no puede pasar de 160 caracteres"],
      default: "",
    },
    // Imagen de fondo (URL). Opcional: sin ella la tarjeta usa un degradado con
    // el color de acento, que es preferible a un hueco roto.
    image: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (v) => imagenSegura(v) !== null,
        message: "La imagen tiene que ser una URL http(s)",
      },
    },
    // A dónde lleva. Externa (sitio del anunciante) o interna (/descubrir/...).
    url: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (v) => urlSegura(v) !== null,
        message: 'El enlace tiene que empezar con "https://" o con "/"',
      },
    },
    ctaLabel: {
      type: String,
      trim: true,
      maxlength: [30, "El texto del botón no puede pasar de 30 caracteres"],
      default: "",
    },
    // Quién lo publica. En una publicidad es obligatorio en la práctica: el
    // usuario tiene derecho a saber de quién es el mensaje.
    sponsor: {
      name: { type: String, trim: true, maxlength: 60, default: "" },
      logo: {
        type: String,
        trim: true,
        default: "",
        validate: {
          validator: (v) => imagenSegura(v) !== null,
          message: "El logo tiene que ser una URL http(s)",
        },
      },
    },
    /**
     * Si esto es espacio pago. Ortogonal a `type`: cualquier contenido puede
     * serlo.
     *
     * Antes lo forzaba un hook cuando `kind` era "ad", porque el tipo y el
     * cobro eran el mismo campo. Ahora que son dos, esto se marca a mano — y por
     * eso la responsabilidad se mueve a donde se carga: el panel lo pide
     * explícitamente y la tarjeta muestra el cartel sin excepción cuando está
     * en true (ver PromoCard). Marcarlo mal es un error de carga, no un agujero
     * del modelo.
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
      validate: {
        validator: (v) => colorSeguro(v) !== null,
        message: "El color de acento tiene que ser un color CSS (#c6465f, rgb(…) o un nombre)",
      },
    },
    // Cuándo se muestra. `startsAt` vacío = desde ya; `endsAt` vacío = hasta que
    // lo bajes a mano.
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // Cuándo ES el evento (distinto de cuándo se muestra la tarjeta: una feria de
    // octubre se promociona desde agosto).
    eventAt: { type: Date, default: null },
    /**
     * Clave de orden secundaria, derivada de `eventAt`.
     *
     * Existe para que el orden lo haga MONGO y no JavaScript. Antes se traían
     * todas las campañas vigentes y se ordenaban en memoria: con veinte campañas
     * da igual, con dos mil se traen dos mil documentos en cada visita a Descubrí
     * para mostrar seis. Con este campo el índice cubre `sort` + `limit` y la
     * consulta toca exactamente las seis filas que se van a mostrar.
     *
     * El truco que resuelve: `eventAt` nulo tiene que ordenar AL FINAL, y Mongo
     * pone los nulos primero en orden ascendente. Acá un nulo se guarda como una
     * fecha lejanísima, así que cae solo donde corresponde sin ningún caso
     * especial en la consulta.
     */
    sortDate: { type: Date, default: null },
    place: {
      city: { type: String, trim: true, maxlength: 60, default: "" },
      venue: { type: String, trim: true, maxlength: 80, default: "" },
    },
    /**
     * Visible en la app. Es el interruptor de "mostrar/ocultar" y también el de
     * "pausar sin eliminar": son la misma operación, y tener dos casillas que
     * significan casi lo mismo es la forma más rápida de que una campaña quede
     * apagada por la otra y nadie encuentre por qué.
     */
    active: {
      type: Boolean,
      default: true,
    },
    // Mayor va primero. Acotada a propósito: un valor absurdo (1e9, -Infinity)
    // convierte la clave de orden en algo que nadie puede razonar después.
    priority: {
      type: Number,
      default: 0,
      min: [0, "La prioridad va de 0 a 999"],
      max: [999, "La prioridad va de 0 a 999"],
    },
    /**
     * Totales de toda la vida de la campaña.
     *
     * `impressions` cuenta veces mostrada y `reach` personas distintas que la
     * vieron. Son dos números diferentes y confundirlos es la forma clásica de
     * reportarle a un anunciante el triple de lo que pasó: la misma persona
     * abriendo Descubrí tres veces es una impresión cada vez, pero UNA persona.
     *
     * Con los clics pasa lo mismo y por eso son dos también: `clicks` son toques
     * y `clickReach` es gente. La efectividad se calcula con los dos números de
     * gente —`clickReach` sobre `reach`—, porque mezclar toques con personas daba
     * porcentajes por encima de 100.
     */
    /**
     * La llave del informe que ve el anunciante.
     *
     * Es un enlace y no una cuenta a propósito: pedirle a alguien que se
     * registre para ver si su publicidad se está viendo es un trámite que
     * termina en "mandame una captura", y una captura no la audita nadie. Con el
     * enlace entra, mira sus números y los cruza con lo que le facturaste.
     *
     * Se genera recién cuando se pide, así que una campaña que nunca se compartió
     * no tiene ninguna puerta abierta. Es de sólo lectura y sólo de SU campaña.
     */
    reportToken: { type: String, default: null, index: true, sparse: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clickReach: { type: Number, default: 0 },
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

/**
 * El índice de la consulta pública, en el orden exacto en que se usa:
 * igualdad (`active`) → rangos (las fechas) → orden (`priority`, `sortDate`).
 * Así Mongo resuelve filtro, orden y `limit` con el índice solo, sin traer ni
 * ordenar en memoria. Es lo que hace que la portada cueste lo mismo con veinte
 * campañas que con veinte mil.
 */
promotionSchema.index({ active: 1, startsAt: 1, endsAt: 1, priority: -1, sortDate: 1 });
// El panel lista por prioridad y por lo más nuevo.
promotionSchema.index({ priority: -1, createdAt: -1 });
/**
 * La portada ya no hace UNA consulta: hace una por grupo, porque las vinotecas y
 * los eventos ocupan secciones distintas con cupos distintos. Con el índice
 * anterior, pedir "las 3 vinotecas al aire" obligaba a escanear todo lo vigente
 * y descartar. Con `type` adelante, cada grupo toca sólo sus filas.
 */
promotionSchema.index({ type: 1, active: 1, startsAt: 1, endsAt: 1, priority: -1, sortDate: 1 });

promotionSchema.pre("save", function () {
  this.updatedAt = new Date();
});

/**
 * Las invariantes de una campaña, todas juntas y antes de que se guarde.
 *
 * Va en `validate` y no en `save` por la misma razón que el hook de lotes de
 * wine.model.js: `validate` corre como parte de cualquier `save()`, así que cubre
 * los mismos caminos, y además deja las reglas comprobables sin una base de datos
 * de por medio.
 */
// Año 3000: cualquier `eventAt` real cae antes, así que las campañas sin fecha de
// evento quedan siempre al final de su grupo de prioridad.
const SIN_FECHA_DE_EVENTO = new Date("3000-01-01T00:00:00.000Z");

promotionSchema.pre("validate", function () {
  // Acá estaba `if (this.kind === "ad") this.sponsored = true`. Se fue con
  // `kind`: ahora el tipo dice qué es y `sponsored` dice si se pagó, y forzar
  // uno desde el otro es justamente lo que impedía tener una vinoteca paga y
  // una vinoteca recomendada en la misma sección.

  this.sortDate = this.eventAt || SIN_FECHA_DE_EVENTO;

  /**
   * Una ventana al revés no se guarda.
   *
   * Sin esto la campaña se acepta, no se muestra nunca y el panel la reporta como
   * "Finalizada" el mismo día que se cargó. El administrador ve un estado raro sin
   * ninguna explicación y el error se descubre cuando el anunciante pregunta por
   * qué no salió. Es exactamente el tipo de error que hay que hacer ruidoso en el
   * momento de cargarlo, que es cuando se puede arreglar en dos segundos.
   */
  if (this.startsAt && this.endsAt && this.endsAt.getTime() < this.startsAt.getTime()) {
    this.invalidate(
      "endsAt",
      "La fecha de fin no puede ser anterior a la de inicio: la campaña no se mostraría nunca"
    );
  }
});

/** El instante desde el que una fecha del panel arranca / termina. */
promotionSchema.statics.parseDesde = (valor) => parseFecha(valor, "inicio");
promotionSchema.statics.parseHasta = (valor) => parseFecha(valor, "fin");

module.exports = mongoose.model("Promotion", promotionSchema);
