/**
 * Las reglas de una campaña, sin base de datos en el medio.
 *
 * ── POR QUÉ ESTO VIVE APARTE ────────────────────────────────────────────────
 * "¿Está activa?" se preguntaba en tres lugares: la consulta pública (Mongo), el
 * panel (JavaScript del navegador) y el ojo del administrador. Tres lecturas de
 * la misma regla es una garantía de que en algún momento van a decir cosas
 * distintas, y el día que eso pasa el panel MIENTE: dice "En vivo" sobre algo que
 * la app no está mostrando. Frente a alguien que pagó por ese espacio, eso no se
 * puede defender.
 *
 * Acá está la única definición. El server la aplica y le manda al panel el estado
 * YA RESUELTO, así que el navegador no vuelve a calcularlo: no tiene con qué
 * equivocarse.
 *
 * Además, al ser funciones puras se pueden testear sin Mongo levantado. Una
 * invariante que sólo se puede probar con la base andando es una invariante que en
 * la práctica nadie prueba.
 */

/**
 * Argentina es UTC-3 todo el año (no hay horario de verano desde 2009).
 *
 * Importa más de lo que parece. El panel carga fechas con un `<input type="date">`,
 * que entrega "2026-08-01" sin hora. Interpretarlo como UTC —que es lo que hace
 * `new Date("2026-08-01")`— pone el arranque de la campaña a las 21:00 del 31 de
 * julio hora local: la campaña sale al aire un día antes de lo pactado. Y del otro
 * lado, un fin el "2026-12-31" cerraba a la medianoche UTC, o sea 21:00 del 30:
 * el anunciante perdía las últimas 27 horas que pagó.
 *
 * Por eso una fecha sin hora se lee como el día CALENDARIO argentino completo:
 * desde 00:00 hasta 23:59:59.999 locales.
 */
const OFFSET_AR_MINUTOS = -180;
const OFFSET_AR_MS = OFFSET_AR_MINUTOS * 60 * 1000;

/** Los cuatro estados que puede tener una campaña, y cómo se llaman en pantalla. */
const ESTADOS = {
  active: { label: "Activa", hint: "Se está mostrando en la app" },
  scheduled: { label: "Programada", hint: "Empieza en la fecha que le pusiste" },
  paused: { label: "Pausada", hint: "Oculta: nadie la ve, sus números se conservan" },
  ended: { label: "Finalizada", hint: "Terminó su ventana de vigencia" },
};

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una fecha del formulario a un instante.
 *
 * `borde` decide qué punto del día calendario argentino se toma cuando el valor
 * viene sin hora: el arranque para "desde", el último milisegundo para "hasta".
 * Un valor con hora (viene de una integración o de un `datetime-local`) se
 * respeta tal cual.
 */
const parseFecha = (valor, borde = "inicio") => {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  const texto = String(valor).trim();
  if (!texto) return null;

  if (SOLO_FECHA.test(texto)) {
    const [a, m, d] = texto.split("-").map(Number);
    const base = Date.UTC(a, m - 1, d);
    // Restar el offset lleva de "medianoche en Argentina" al instante UTC real.
    return new Date(base - OFFSET_AR_MS + (borde === "fin" ? 24 * 60 * 60 * 1000 - 1 : 0));
  }

  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

/**
 * Un instante al "YYYY-MM-DD" que espera un `<input type="date">`, en fecha
 * argentina.
 *
 * Es la vuelta exacta de `parseFecha`: un fin guardado como 02:59:59.999 UTC del
 * 1° de enero vuelve a leerse como el 31 de diciembre, que es el día que el
 * administrador escribió. Sin esta simetría el panel le corre un día las fechas
 * cada vez que se abre el formulario para editar.
 */
const aFechaInput = (valor) => {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Date(fecha.getTime() + OFFSET_AR_MS).toISOString().slice(0, 10);
};

/** El día argentino de un instante, como YYYY-MM-DD. La clave de las stats diarias. */
const diaDe = (valor = new Date()) => aFechaInput(valor instanceof Date ? valor : new Date(valor));

/**
 * El estado de una campaña. La única definición que existe.
 *
 * El orden de las preguntas es deliberado:
 *
 *  1. FINALIZADA primero, incluso si además está pausada. Es la información más
 *     útil de las dos: "pausada" sugiere que alcanza con volver a prenderla, y en
 *     una campaña vencida eso no hace nada. Decir "pausada" ahí manda al
 *     administrador a tocar el interruptor y a no entender por qué no pasa nada.
 *  2. PAUSADA antes que programada: es una decisión humana explícita y pisa
 *     cualquier fecha.
 *  3. PROGRAMADA si todavía no arrancó.
 *  4. ACTIVA sólo cuando no queda ninguna razón para no mostrarla. Este es el
 *     único estado que la app muestra, y coincide exactamente con lo que filtra
 *     `listPublic`.
 */
const estadoDe = (promo = {}, ahora = new Date()) => {
  const t = ahora instanceof Date ? ahora.getTime() : new Date(ahora).getTime();
  const fin = promo.endsAt ? new Date(promo.endsAt).getTime() : null;
  const inicio = promo.startsAt ? new Date(promo.startsAt).getTime() : null;

  if (fin !== null && fin < t) return "ended";
  if (promo.active === false) return "paused";
  if (inicio !== null && inicio > t) return "scheduled";
  return "active";
};

/** ¿La app la está mostrando ahora mismo? */
const estaAlAire = (promo, ahora = new Date()) => estadoDe(promo, ahora) === "active";

/**
 * Una URL aceptable para una tarjeta.
 *
 * Devuelve el valor saneado, "" si no había nada, o `null` si es inválida —y el
 * llamador convierte eso en un error de validación en vez de guardarlo—.
 *
 * ── POR QUÉ ESTO ES SEGURIDAD Y NO PROLIJIDAD ───────────────────────────────
 * El destino de la tarjeta termina en `window.open(url)` o en `navigate(url)`.
 * Un `javascript:` ahí ejecuta código en la sesión de quien toque la tarjeta, y
 * `data:text/html` sirve una página que se ve como la app. El campo lo llena un
 * administrador hoy, pero el día que el formulario lo complete un anunciante, el
 * único control que queda es este. Se valida acá, en el server, porque es el único
 * lugar por el que pasa todo.
 *
 * `//otro-sitio.com` se rechaza aparte: empieza con "/" y pasaría por interno,
 * pero el navegador lo resuelve como un dominio ajeno.
 */
const urlSegura = (valor, { maxLength = 500 } = {}) => {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  if (texto.length > maxLength) return null;
  // Enlace interno de la app.
  if (texto.startsWith("/")) return texto.startsWith("//") ? null : texto;
  if (/^https?:\/\/[^\s/]+/i.test(texto)) return texto;
  return null;
};

/** Una imagen sólo puede venir por http(s). Ver `urlSegura` para el por qué. */
const imagenSegura = (valor, { maxLength = 500 } = {}) => {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  if (texto.length > maxLength) return null;
  return /^https?:\/\/[^\s/]+/i.test(texto) ? texto : null;
};

/**
 * Un color de acento usable.
 *
 * Se inyecta como variable CSS de la tarjeta y después entra en `color-mix()`. Un
 * valor que no es un color no rompe nada visible: hace que `color-mix()` no
 * resuelva y la tarjeta pierda el borde y el botón, sin ningún error a la vista.
 * Es peor que un rechazo: la campaña se ve mal y nadie sabe por qué. Mejor
 * decirlo al guardar.
 */
const COLOR_HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCION = /^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/deg-]+\)$/i;
const COLOR_NOMBRE = /^[a-z]{3,20}$/i;

const colorSeguro = (valor) => {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  if (texto.length > 30) return null;
  if (COLOR_HEX.test(texto) || COLOR_FUNCION.test(texto) || COLOR_NOMBRE.test(texto)) return texto;
  return null;
};

module.exports = {
  ESTADOS,
  OFFSET_AR_MINUTOS,
  parseFecha,
  aFechaInput,
  diaDe,
  estadoDe,
  estaAlAire,
  urlSegura,
  imagenSegura,
  colorSeguro,
};
