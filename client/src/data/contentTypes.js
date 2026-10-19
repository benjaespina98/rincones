/**
 * La taxonomía de contenido de Descubrí.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * Descubrí venía siendo una pila de secciones que no se conocían entre sí: el
 * carrusel de campañas tenía su tarjeta y su CSS, los enlaces curados tenían
 * otros, las playlists otros, la lección otro. Cinco formas de dibujar "una cosa
 * con título, bajada, ícono y enlace", que se despegaban entre sí en cuanto
 * alguien tocaba una — y agregar un tipo nuevo (una nota, una bodega) era
 * escribir la sexta.
 *
 * Acá hay una sola declaración de QUÉ tipos de contenido existen y cómo se ve
 * cada uno. `ContentCard` la lee y dibuja cualquiera de ellos; las secciones
 * sólo eligen qué ítems mandarle y con qué variante.
 *
 * ── EL TIPO NO DICE SI ES PAGO ──────────────────────────────────────────────
 * `sponsored` es un campo aparte del ítem, no un tipo. Cualquier contenido puede
 * ser patrocinado —una vinoteca, una nota, un evento— y lo único que cambia es
 * un badge chico. No existe un tipo "publicidad": esa era exactamente la mezcla
 * que hacía que una vinoteca paga no pudiera declararse vinoteca, y por lo tanto
 * no pudiera caer en la sección donde el usuario la está buscando.
 *
 * La contracara es innegociable: cuando `sponsored` es true, el badge va SIEMPRE.
 * Es lo que mantiene creíble a todo lo demás de la pantalla.
 *
 * ── DE DÓNDE VIENEN LOS ÍTEMS ───────────────────────────────────────────────
 * De dos fuentes que se normalizan a la misma forma:
 *   · el panel admin (Promotion) — event, wineShop, winery, article, course, video
 *   · curaduría en código        — video, course, playlist, lesson
 * La tarjeta no sabe ni le importa de cuál vino cada uno.
 */

/**
 * La forma de un ítem de contenido, para que quede escrita en algún lado:
 *
 *   {
 *     id,                 // único y estable
 *     type,               // una clave de CONTENT_TYPES
 *     title,
 *     summary,            // una línea
 *     image?,             // foto o logo
 *     url?,               // externa (https) o interna (/…)
 *     ctaLabel?,          // pisa el CTA por defecto del tipo
 *     meta?,              // línea de procedencia ya armada: "Mendoza · Spotify"
 *     badge?,             // "Gratis", "En inglés" — lo que conviene saber antes
 *     sponsored?,         // si alguien paga por estar acá
 *     sponsorName?,       // de quién es el mensaje
 *     eventAt?,           // sólo eventos
 *     onOpen?,            // en vez de navegar (la lección abre una hoja)
 *   }
 */

export const CONTENT_TYPES = {
  event: {
    label: "Evento",
    icon: "calendar",
    accent: "#f2b737",
    cta: "Ver el evento",
  },
  wineShop: {
    label: "Vinoteca",
    icon: "store",
    accent: "#e0637d",
    cta: "Ver tienda",
  },
  winery: {
    label: "Bodega",
    icon: "map-pin",
    accent: "#c6465f",
    cta: "Conocerla",
  },
  article: {
    label: "Nota",
    icon: "list",
    accent: "#7e59c9",
    cta: "Leer",
  },
  book: {
    label: "Libro",
    icon: "book",
    accent: "#7e59c9",
    cta: "Ver el libro",
  },
  course: {
    label: "Curso",
    icon: "graduation",
    accent: "#7e59c9",
    cta: "Ver el curso",
  },
  video: {
    label: "Video",
    icon: "play",
    accent: "#e0637d",
    cta: "Ver",
  },
  playlist: {
    label: "Música",
    icon: "music",
    accent: "#1db954",
    cta: "Escuchar",
  },
  // No viene del panel: es contenido propio de la app (data/wineConcepts.js) y
  // no navega a ningún lado, abre una hoja. Ver DailyLesson.
  lesson: {
    // Mismo rótulo que muestra la tarjeta (ver DailyLesson): el tipo de
    // contenido tiene que llamarse igual en los dos lados.
    label: "Algo que quizá no sabías",
    icon: "graduation",
    accent: "#b497f3",
    cta: "Leer",
  },
};

/** El tipo, con un fallback que nunca rompe la tarjeta. */
export const typeInfo = (type) => CONTENT_TYPES[type] || CONTENT_TYPES.article;

/**
 * Un `Promotion` del server con la forma de un ítem de contenido.
 *
 * La conversión vive acá y no en cada sección porque las tres —vinotecas,
 * evento destacado, feed— reciben documentos del mismo endpoint y tienen que
 * leerlos igual. Con la traducción repartida, alcanzaba con que una olvidara
 * `sponsored` para que una tarjeta paga saliera sin su cartel.
 */
export const fromPromotion = (p) => ({
  id: p._id,
  // Marca que este ítem viene del panel y por lo tanto SE MIDE. Los curados no
  // llevan la marca y el conteo se saltea solo (ver TrackedCard): así ninguna
  // sección tiene que saber de dónde salió cada tarjeta para medir bien.
  tracked: true,
  type: p.type || "event",
  title: p.title || "",
  summary: p.summary || "",
  image: p.image || "",
  url: p.url || "",
  ctaLabel: p.ctaLabel || "",
  accent: p.accent || "",
  sponsored: p.sponsored === true,
  sponsorName: p.sponsor?.name || "",
  sponsorLogo: p.sponsor?.logo || "",
  city: p.place?.city || "",
  venue: p.place?.venue || "",
  eventAt: p.eventAt || null,
});

/**
 * Fecha del evento en lenguaje corto: "12 de octubre".
 *
 * `timeZone: "UTC"` porque la fecha se guarda como el arranque del día en
 * Argentina (03:00 UTC) y sin esto el navegador la volvería a pasar a hora
 * local, restando tres horas y mostrando el DÍA ANTERIOR: un evento cargado el
 * 7 de marzo salía "6 de marzo". Un día de diferencia en la fecha de una feria
 * es el tipo de error que hace que alguien llegue cuando ya terminó.
 */
export const shortDate = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });
};

/** Lugar · fecha, lo concreto primero. Vacío si el ítem no tiene ninguno. */
export const itemMeta = (item) => {
  if (item.meta) return item.meta;
  return [item.venue || item.city, shortDate(item.eventAt)].filter(Boolean).join(" · ");
};

/**
 * Un evento se gana la tarjeta grande sólo si la puede sostener.
 *
 * La spec pide una tarjeta grande con imagen, nombre, fecha, lugar y CTA. Un
 * evento sin imagen y sin fecha dibujado en grande es un rectángulo con dos
 * renglones en el medio: peor que la fila del feed, donde al menos se ve
 * completo. Los que no califican no se pierden — caen al feed.
 */
export const deservesHero = (item) =>
  item?.type === "event" && Boolean(item.image) && Boolean(item.eventAt);
