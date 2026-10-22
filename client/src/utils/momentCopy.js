/* ── Textos que dependen del contexto ──────────────────────────────────────
   Acá vivía un generador de frases: cada razón tenía dos o tres redacciones y
   una semilla elegía cuál salía, para que la home "no se sintiera muerta". El
   resultado era el contrario del buscado: la app hablaba todo el tiempo, en
   primera persona y con voz de barra ("Hace frío y todavía no tenés Malbec",
   "Es viernes. Un espumante no necesita más excusa"), y eso es exactamente lo
   que hace que un producto se lea como escrito por una máquina que quiere caer
   bien.

   Las apps con las que se compara ésta —Vivino, Uber, Cabify— no conversan:
   rotulan. Dicen "Recomendado para vos" y muestran el vino. La calidez sale de
   que la pantalla sea obvia, no de que tenga onda.

   Reglas de este archivo:
   · una razón, una forma de decirla (se fue el `pick` y la semilla);
   · frases cortas pero ENTERAS. Recortarlas hasta el telegrama —"Tomás
     Malbec", "Tinto para el frío"— no es sobriedad, es sequedad: se lee como
     un campo de base de datos y no como algo que alguien escribió. El molde es
     el de Vivino ("Porque te gusta el Malbec"): una línea que se pueda leer en
     voz alta sin que suene a etiqueta;
   · si no hay nada concreto que decir, se devuelve `null` y no se dibuja nada.
     Un renglón de relleno cuesta más que el silencio. */

const hour = () => new Date().getHours();
const month = () => new Date().getMonth(); // 0-11

/** Verano en el hemisferio sur: diciembre a marzo. */
const isHot = () => {
  const m = month();
  return m === 11 || m <= 2;
};

/** Invierno en el hemisferio sur: junio, julio, agosto. */
const isCold = () => {
  const m = month();
  return m >= 5 && m <= 7;
};

/* ── La hora del día, en cinco franjas ──────────────────────────────────────
   La consumen el saludo y el plan de la ficha. Antes el único corte era
   `hour >= 19`, y con eso la app hablaba de la noche durante las otras
   diecinueve horas del día. */
export const dayPart = (h = hour()) => {
  if (h < 6) return "madrugada";
  if (h < 12) return "mañana";
  if (h < 15) return "mediodia";
  if (h < 20) return "tarde";
  return "noche";
};

/** Desde el mediodía en adelante: cuando servir un vino ya no es raro. */
const esHoraDeVino = () => ["mediodia", "tarde", "noche"].includes(dayPart());

/** El saludo del encabezado. "Todavía despierto" a las 3 AM era un chiste que
    la app no tiene por qué hacer: a esa hora también es de noche. */
/* El saludo cambia de un día al otro (y de una franja a otra) pero NO durante el día: la misma persona no ve
   "Hola" y "Buenas tardes" alternarse entre dos visitas. Con uno solo, la pantalla de entrada se leía como una
   plantilla que se repite. Todos llevan después ", Nombre". */
const SALUDOS = {
  mañana: ["Buen día", "Hola", "Qué bueno verte"],
  tarde: ["Buenas tardes", "Hola", "Qué bueno verte"],
  noche: ["Buenas noches", "Hola", "Qué bueno verte por acá"],
};

export const greeting = (ahora = new Date()) => {
  const franja = dayPart() === "mañana" ? "mañana" : dayPart() === "noche" || dayPart() === "madrugada" ? "noche" : "tarde";
  const dia = Math.floor(ahora.getTime() / 86400000);
  const opciones = SALUDOS[franja];
  return opciones[(dia + franja.length) % opciones.length];
};

/**
 * El renglón de estado bajo el saludo.
 *
 * Sólo aparece cuando dice algo ACCIONABLE. Antes era una pregunta retórica
 * rotativa ("¿Qué abrimos esta noche?", "¿Con qué cerramos el día?") que salía
 * siempre, ocupaba el lugar más visible de la app y no llevaba a ningún lado.
 * Ahora, con la bodega andando, no hay renglón: el buscador y la recomendación
 * arrancan más arriba.
 */
export const homeTitle = ({ stats } = {}) => {
  // `stats` en null es "la consulta todavía no respondió", no "bodega en cero":
  // sin el dato no se afirma nada.
  if (!stats) return null;

  const total = stats?.totals?.total || 0;
  const stock = stats?.totals?.stock || 0;

  if (total === 0) return "Todavía no cargaste ningún vino";
  if (stock === 0) return "No te quedan botellas en stock";
  return null;
};

/* ── Vocabulario de tipos ──────────────────────────────────────────────────
   Las claves son las de wineReference/WineArtwork. Se agrupan por cómo se
   toman, que es lo que importa para recomendar: un oporto y un malbec comparten
   momento (noche, frío, comida pesada) aunque no compartan categoría. */
const TINTOS = new Set(["red", "fortified"]);
const FRESCOS = new Set(["white", "rosé", "sparkling"]);

const norm = (s) => String(s || "").trim().toLowerCase();

/* El server devuelve `topVarietals` con `$limit: 10` (ver
   server/src/models/wine.model.js). Si llegaron 10, la lista puede estar
   truncada y NO sabemos qué uvas quedaron afuera: en ese caso está prohibido
   afirmar que no tenés una. Con menos de 10, la lista es completa. */
const LIMITE_VARIETALES = 10;

const tieneUva = (varietals, uva) =>
  varietals.some((v) => v.varietal && norm(v.varietal) === norm(uva));

/** Sólo devuelve true cuando la ausencia es verificable, no cuando es probable. */
const leFaltaLaUva = (varietals, uva) =>
  Boolean(uva) && varietals.length < LIMITE_VARIETALES && !tieneUva(varietals, uva);

/**
 * Por qué le mostramos ESTE vino: una etiqueta corta, no una frase.
 *
 * Sale del momento (hora, estación) cruzado con los datos del propio usuario,
 * así que es instantáneo, gratis y siempre cierto — a diferencia de pedírselo a
 * un modelo, que tardaría, gastaría cuota y podría inventar un gusto que no
 * tenés.
 *
 * El orden es por especificidad: primero lo que sale de tu bodega (es lo único
 * que no podría decir cualquier app), después el momento. Si no hay nada
 * verificable, devuelve `null` y la tarjeta no muestra el renglón.
 */
export const whyThisWine = (wine, stats) => {
  if (!wine) return null;

  const varietals = stats?.topVarietals || [];
  const regions = stats?.topRegions || [];
  const total = stats?.totals?.total || 0;

  const uva = wine.varietal || "";
  const esTinto = TINTOS.has(wine.type);
  const esFresco = FRESCOS.has(wine.type);

  // ── Lo que sale de tu bodega ────────────────────────────────────────────
  const mismaUva = varietals.find((v) => v.varietal && uva && norm(v.varietal) === norm(uva));
  if (mismaUva?.count >= 2) return `Porque tomás ${mismaUva.varietal}`;

  const mismaRegion = regions.find(
    (r) => r.region && wine.region && norm(wine.region).includes(norm(r.region))
  );
  if (mismaRegion?.count >= 2) return `De ${mismaRegion.region}, como varios de los tuyos`;

  if (total >= 3 && leFaltaLaUva(varietals, uva)) return `Todavía no tenés ningún ${uva}`;

  // ── El momento ──────────────────────────────────────────────────────────
  if (isCold() && esTinto) return "Un tinto para los días de frío";
  if (isHot() && esFresco && esHoraDeVino()) return "Se toma bien frío, para este calor";

  return null;
};

/**
 * Encabezado del plan de la ficha.
 *
 * Fijo. Era "Plan para esta noche / la tarde / el mediodía / esta madrugada",
 * o sea cuatro títulos para la misma sección: quien vuelve a la ficha del
 * mismo vino a otra hora la encuentra con otro nombre y tiene que releerla para
 * entender que es la de siempre. Un rótulo identifica una sección; no es el
 * lugar para mostrar la hora.
 */
export const planTitle = () => "Con qué acompañarla";
