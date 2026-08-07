// Textos que cambian por CONTEXTO, no al azar.
//
// La idea es que la app se sienta viva sin volverse un generador de frases: si
// hay algo real que decir (tenés tintos listos para abrir, hace calor, tomás
// mucho Malbec) lo decimos; si no, cae a una línea neutra. Un texto aleatorio
// que no responde a nada se nota enseguida y cansa.

const hour = () => new Date().getHours();
const month = () => new Date().getMonth(); // 0-11
const weekday = () => new Date().getDay(); // 0 domingo - 6 sábado

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

/** Viernes, sábado y domingo: los días en que se abre una botella sin motivo. */
const isWeekend = () => [5, 6, 0].includes(weekday());

const isEvening = () => hour() >= 19;

export const greeting = () => {
  const h = hour();
  // Antes "Buenas noches" cubría 10 de las 24 horas (h<6 y h>=20).
  if (h < 6) return "Todavía despierto";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
};

/**
 * Título de la home. Deriva del estado real de la bodega; sólo si no hay nada
 * que contar usa la pregunta genérica.
 */
export const homeTitle = ({ stats } = {}) => {
  const total = stats?.totals?.total || 0;
  const stock = stats?.totals?.stock || 0;

  if (total === 0) return "Empecemos tu bodega";

  const top = stats?.topVarietals?.[0];
  const h = hour();

  if (stock === 0) return "Tu bodega está vacía por ahora";
  if (isHot() && h >= 12) return "¿Un blanco fresco para hoy?";
  if (h >= 20) return "¿Qué abrimos esta noche?";
  if (stock === 1) return "Te queda una botella";
  if (top?.count >= 3) return `¿Seguimos con ${top.varietal} o cambiamos?`;
  return "¿Qué vino descubrimos hoy?";
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
 * Por qué le mostramos ESTE vino.
 *
 * Sale del momento (hora, día, estación) cruzado con los datos del propio
 * usuario, así que es instantáneo, gratis y siempre cierto — a diferencia de
 * pedírselo a un modelo, que tardaría, gastaría cuota y podría inventar un
 * gusto que no tenés.
 *
 * El orden es por ESPECIFICIDAD, no por importancia: primero las razones que
 * cruzan dos señales ("hace frío" + "no tenés esta uva"), porque son las que se
 * leen como escritas para vos. Las que dependen de una sola señal van después.
 * Nunca se afirma algo que no se pueda verificar con los datos que tenemos.
 */
export const whyThisWine = (wine, stats) => {
  if (!wine) return null;

  const varietals = stats?.topVarietals || [];
  const regions = stats?.topRegions || [];
  const types = stats?.countsByType || [];
  const total = stats?.totals?.total || 0;

  const uva = wine.varietal || "";
  const esTinto = TINTOS.has(wine.type);
  const esFresco = FRESCOS.has(wine.type);
  const h = hour();

  // ── Nivel 1: el momento + algo tuyo ─────────────────────────────────────
  // Dos señales cruzadas. Es el único nivel que se lee como si alguien hubiera
  // mirado tu bodega y la ventana al mismo tiempo.
  if (isCold() && esTinto && leFaltaLaUva(varietals, uva)) {
    return `Hace frío y todavía no tenés ${uva} en tu bodega`;
  }

  if (isHot() && esFresco && leFaltaLaUva(varietals, uva)) {
    return `Con este calor entra solo, y ${uva} te falta`;
  }

  if (isWeekend() && esTinto && h >= 11 && h < 23) {
    return "Para el asado del finde: un tinto que se banca la parrilla";
  }

  // ── Nivel 2: algo tuyo, verificable y concreto ──────────────────────────
  const mismaUva = varietals.find((v) => v.varietal && uva && norm(v.varietal) === norm(uva));
  if (mismaUva?.count >= 2) {
    return `Porque ya tenés ${mismaUva.count} ${mismaUva.varietal} en tu bodega`;
  }

  const mismaRegion = regions.find(
    (r) => r.region && wine.region && norm(wine.region).includes(norm(r.region))
  );
  if (mismaRegion?.count >= 2) return `De ${mismaRegion.region}, como varios de los tuyos`;

  // ── Nivel 3: el momento solo ────────────────────────────────────────────
  if (isCold() && esTinto && isEvening()) return "Para una noche fría como esta";

  if (isHot() && esFresco && h >= 12) return "Con este calor, se toma bien frío";

  if (wine.type === "sparkling" && weekday() === 5) {
    return "Es viernes. Un espumante no necesita más excusa";
  }

  // ── Nivel 4: tu perfil, en voz más baja ─────────────────────────────────
  if (total >= 3 && leFaltaLaUva(varietals, uva)) {
    return `${uva} para salir de lo de siempre`;
  }

  const tipoHabitual = types[0];
  if (tipoHabitual && wine.type && tipoHabitual.type !== wine.type && tipoHabitual.count >= 3) {
    return "Para variar un poco de lo que solés tomar";
  }

  // ── Piso: contextual, nunca genérico ────────────────────────────────────
  // "Elegido para hoy" no dice nada: es el rótulo que pone una app cuando no
  // tiene nada para decir. Estas dos son verdad siempre y al menos ubican al
  // vino en un momento.
  if (esFresco) return "Un fresco para tener a mano";
  return isEvening() ? "Para abrir esta noche" : "Para la próxima que descorches";
};

/*
 * Acá estaba `recoHint`, el subtítulo del segundo bloque de recomendaciones de
 * Descubrí ("Elegidos pensando en tus Malbec"). Ese bloque dejó de ser una
 * recomendación —es el catálogo para seguir mirando— porque dos secciones
 * diciendo "elegidos para vos" en la misma pantalla le quitaban valor a la
 * primera. Sin llamador, la función se va: está en el historial de git.
 */
