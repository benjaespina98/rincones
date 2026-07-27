// Textos que cambian por CONTEXTO, no al azar.
//
// La idea es que la app se sienta viva sin volverse un generador de frases: si
// hay algo real que decir (tenés tintos listos para abrir, hace calor, tomás
// mucho Malbec) lo decimos; si no, cae a una línea neutra. Un texto aleatorio
// que no responde a nada se nota enseguida y cansa.

const hour = () => new Date().getHours();
const month = () => new Date().getMonth(); // 0-11

/** Verano en el hemisferio sur: diciembre a marzo. */
const isHot = () => {
  const m = month();
  return m === 11 || m <= 2;
};

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

/**
 * Por qué le mostramos ESTE vino. Sale de los datos del propio usuario, así que
 * es instantáneo, gratis y siempre cierto — a diferencia de pedírselo a un
 * modelo, que tardaría, gastaría cuota y podría inventar un gusto que no tenés.
 */
export const whyThisWine = (wine, stats) => {
  if (!wine || !stats) return null;

  const varietals = stats.topVarietals || [];
  const regions = stats.topRegions || [];
  const types = stats.countsByType || [];

  const sameGrape = varietals.find(
    (v) => v.varietal && wine.varietal && v.varietal.toLowerCase() === wine.varietal.toLowerCase()
  );
  if (sameGrape?.count >= 2) {
    return `Porque tenés ${sameGrape.count} ${sameGrape.varietal} en tu bodega`;
  }

  const sameRegion = regions.find(
    (r) => r.region && wine.region && wine.region.toLowerCase().includes(r.region.toLowerCase())
  );
  if (sameRegion?.count >= 2) return `De ${sameRegion.region}, como varios de los tuyos`;

  // Si la uva NO está entre las suyas y ya tiene una bodega armada, el valor
  // está justamente en que es distinto.
  const total = stats.totals?.total || 0;
  if (total >= 3 && wine.varietal && !varietals.some((v) => v.varietal === wine.varietal)) {
    return `Un ${wine.varietal} para salir de lo de siempre`;
  }

  const topType = types[0];
  if (topType && wine.type && topType.type !== wine.type && topType.count >= 3) {
    return "Para variar un poco de lo que solés tomar";
  }

  return null;
};

/** Hint de la sección de recomendados, según haya o no un motivo. */
export const recoHint = ({ stats } = {}) => {
  const total = stats?.totals?.total || 0;
  if (total === 0) return "Para empezar tu colección";
  const top = stats?.topVarietals?.[0];
  if (top?.count >= 3) return `Elegidos pensando en tus ${top.varietal}`;
  return "Vinos argentinos para sumar";
};
