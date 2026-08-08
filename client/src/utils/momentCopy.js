// Textos que cambian por CONTEXTO, no al azar.
//
// La idea es que la app se sienta viva sin volverse un generador de frases: si
// hay algo real que decir (tenés tintos listos para abrir, hace calor, tomás
// mucho Malbec) lo decimos; si no, cae a una línea neutra. Un texto aleatorio
// que no responde a nada se nota enseguida y cansa.
//
// ── POR QUÉ AHORA CADA RAZÓN TIENE VARIAS FORMAS DE DECIRSE ─────────────────
// Cada regla devolvía UNA frase fija. Como las señales que las disparan cambian
// despacio —la estación dura tres meses, tu bodega no se mueve todos los días—,
// en la práctica la home saludaba con el mismo renglón durante semanas: "Hace
// frío y todavía no tenés Malbec". La regla era correcta y aun así la app se
// sentía muerta.
//
// La regla sigue eligiendo QUÉ decir (eso no puede ser al azar, es lo que hace
// que la frase sea verdad). Lo que cambia es CÓMO se dice: cada razón tiene dos
// o tres redacciones y se elige una con una semilla. Nadie va a leer las tres,
// pero abrir la app dos días seguidos deja de dar exactamente la misma pantalla.

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

/* ── La hora del día, en cinco franjas ──────────────────────────────────────
   Antes el único corte era `hour >= 19` ("isEvening"), y con eso la app hablaba
   de la noche durante las otras diecinueve horas: abrirla a las 8:35 de la
   mañana te ofrecía un vino "para abrir esta noche". Las franjas son las que
   usa cualquiera para ubicarse en el día, y son las mismas que consumen el
   saludo, el título de la home y el plan de la ficha. */
export const dayPart = (h = hour()) => {
  if (h < 6) return "madrugada";
  if (h < 12) return "mañana";
  if (h < 15) return "mediodia";
  if (h < 20) return "tarde";
  return "noche";
};

/** Desde el mediodía en adelante: cuando servir un vino ya no es raro. */
const esHoraDeVino = () => ["mediodia", "tarde", "noche"].includes(dayPart());

/* ── Elegir entre redacciones ───────────────────────────────────────────────
   `seed` es un número que el llamador mantiene estable mientras la pantalla
   está abierta (ver DiscoverPage): si cambiara en cada render, el texto
   parpadearía mientras lo estás leyendo. */
const hashText = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
};

const pick = (opciones, seed = 0) => {
  if (opciones.length === 1) return opciones[0];
  return opciones[Math.abs(seed) % opciones.length];
};

export const greeting = () => {
  switch (dayPart()) {
    case "madrugada": return "Todavía despierto";
    case "mañana": return "Buen día";
    case "mediodia":
    case "tarde": return "Buenas tardes";
    default: return "Buenas noches";
  }
};

/**
 * Título de la home. Deriva del estado real de la bodega; sólo si no hay nada
 * que contar usa la pregunta genérica.
 */
export const homeTitle = ({ stats, seed = 0 } = {}) => {
  const total = stats?.totals?.total || 0;
  const stock = stats?.totals?.stock || 0;

  if (total === 0) return "Empecemos tu bodega";

  const top = stats?.topVarietals?.[0];
  const franja = dayPart();

  if (stock === 0) return "Tu bodega está vacía por ahora";

  if (isHot() && esHoraDeVino()) {
    return pick(
      ["¿Un blanco fresco para hoy?", "¿Algo bien frío para este calor?", "Día de descorchar algo fresco"],
      seed
    );
  }

  if (franja === "noche") {
    return pick(["¿Qué abrimos esta noche?", "¿Con qué cerramos el día?", "Es hora de elegir una botella"], seed);
  }

  if (stock === 1) return "Te queda una botella";

  if (top?.count >= 3) {
    return pick(
      [`¿Seguimos con ${top.varietal} o cambiamos?`, `Tenés mano de ${top.varietal}, ¿probamos otra cosa?`],
      seed
    );
  }

  if (franja === "mañana") {
    return pick(["¿Qué vino descubrimos hoy?", "Buen momento para elegir la de esta noche"], seed);
  }

  return pick(["¿Qué vino descubrimos hoy?", "¿Qué te dan ganas de tomar?", "Veamos qué hay para descorchar"], seed);
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
 *
 * `seed` sólo decide con cuál de las redacciones de la razón elegida se cuenta;
 * se mezcla con el id del vino para que dos botellas distintas en la misma
 * sesión no salgan siempre con la misma variante.
 */
export const whyThisWine = (wine, stats, seed = 0) => {
  if (!wine) return null;

  const varietals = stats?.topVarietals || [];
  const regions = stats?.topRegions || [];
  const types = stats?.countsByType || [];
  const total = stats?.totals?.total || 0;

  const uva = wine.varietal || "";
  const esTinto = TINTOS.has(wine.type);
  const esFresco = FRESCOS.has(wine.type);
  const franja = dayPart();
  const s = seed + hashText(String(wine.id || wine.name || ""));

  // ── Nivel 1: el momento + algo tuyo ─────────────────────────────────────
  // Dos señales cruzadas. Es el único nivel que se lee como si alguien hubiera
  // mirado tu bodega y la ventana al mismo tiempo.
  if (isCold() && esTinto && leFaltaLaUva(varietals, uva)) {
    return pick([
      `Hace frío y todavía no tenés ${uva} en tu bodega`,
      `${uva} para el invierno, que es la uva que te falta`,
      `El frío pide tinto y ${uva} no lo tenés probado`,
    ], s);
  }

  if (isHot() && esFresco && leFaltaLaUva(varietals, uva)) {
    return pick([
      `Con este calor entra solo, y ${uva} te falta`,
      `${uva} bien frío: no tenés ninguno todavía`,
      `Para el verano, y encima ${uva} no está en tu bodega`,
    ], s);
  }

  if (isWeekend() && esTinto && (franja === "mediodia" || franja === "tarde")) {
    return pick([
      "Para el asado del finde: un tinto que se banca la parrilla",
      "Finde y parrilla: este aguanta el humo",
      "Un tinto de fin de semana, para la mesa larga",
    ], s);
  }

  // ── Nivel 2: algo tuyo, verificable y concreto ──────────────────────────
  const mismaUva = varietals.find((v) => v.varietal && uva && norm(v.varietal) === norm(uva));
  if (mismaUva?.count >= 2) {
    return pick([
      `Porque ya tenés ${mismaUva.count} ${mismaUva.varietal} en tu bodega`,
      `Va por donde venís: tenés ${mismaUva.count} ${mismaUva.varietal}`,
      `${mismaUva.varietal} otra vez, que es lo que más juntás`,
    ], s);
  }

  const mismaRegion = regions.find(
    (r) => r.region && wine.region && norm(wine.region).includes(norm(r.region))
  );
  if (mismaRegion?.count >= 2) {
    return pick([
      `De ${mismaRegion.region}, como varios de los tuyos`,
      `${mismaRegion.region} de nuevo: es la zona que más te gusta`,
    ], s);
  }

  // ── Nivel 3: el momento solo ────────────────────────────────────────────
  if (isCold() && esTinto) {
    if (franja === "noche") {
      return pick(["Para una noche fría como esta", "Frío afuera: este entra en calor"], s);
    }
    if (franja === "tarde" || franja === "mediodia") {
      return pick(["Para una tarde de frío", "Un tinto para el mediodía de invierno"], s);
    }
  }

  if (isHot() && esFresco && esHoraDeVino()) {
    return pick([
      "Con este calor, se toma bien frío",
      "Directo de la heladera, para el calor de hoy",
    ], s);
  }

  if (wine.type === "sparkling" && weekday() === 5) {
    return pick([
      "Es viernes. Un espumante no necesita más excusa",
      "Viernes: las burbujas se justifican solas",
    ], s);
  }

  // ── Nivel 4: tu perfil, en voz más baja ─────────────────────────────────
  if (total >= 3 && leFaltaLaUva(varietals, uva)) {
    return pick([
      `${uva} para salir de lo de siempre`,
      `Todavía no probaste ${uva}`,
      `${uva}: algo distinto a lo que venís tomando`,
    ], s);
  }

  const tipoHabitual = types[0];
  if (tipoHabitual && wine.type && tipoHabitual.type !== wine.type && tipoHabitual.count >= 3) {
    return pick([
      "Para variar un poco de lo que solés tomar",
      "Sale de tu línea habitual, a propósito",
    ], s);
  }

  // ── Piso: contextual, nunca genérico ────────────────────────────────────
  // "Elegido para hoy" no dice nada: es el rótulo que pone una app cuando no
  // tiene nada para decir. Estas son verdad siempre y al menos ubican al vino
  // en un momento — el del reloj de quien está mirando, no el de la noche por
  // defecto.
  if (esFresco) return pick(["Un fresco para tener a mano", "Para tener en la heladera"], s);

  switch (franja) {
    case "madrugada": return "Anotalo para mañana";
    case "mañana": return pick(["Para tenerlo en el radar hoy", "Para la botella de más tarde"], s);
    case "mediodia": return pick(["Para la mesa de hoy", "Va bien con el almuerzo"], s);
    case "tarde": return pick(["Para abrir al caer la tarde", "Para más tarde, sin apuro"], s);
    default: return pick(["Para abrir esta noche", "Buena candidata para hoy"], s);
  }
};

/**
 * El encabezado del plan de la ficha, según la hora del reloj.
 *
 * Decía "Plan de la noche" siempre, y la app se abre a las nueve de la mañana o
 * a las tres de la tarde tanto como a las diez de la noche. Una copa a la
 * tardecita es un plan igual de válido; el rótulo era el único que no se había
 * enterado.
 */
export const planTitle = () => {
  switch (dayPart()) {
    case "madrugada": return "Plan para esta madrugada";
    case "mañana": return "El plan para esta botella";
    case "mediodia": return "Plan para el mediodía";
    case "tarde": return "Plan para la tarde";
    default: return "Plan para esta noche";
  }
};

/** La pregunta que acompaña al título del plan, en la misma franja. */
export const planHint = () => {
  switch (dayPart()) {
    case "mañana": return "¿Para qué momento la guardás?";
    case "mediodia": return "¿Cómo viene el mediodía?";
    case "tarde": return "¿Cómo viene la tarde?";
    default: return "¿Cómo viene la noche?";
  }
};
