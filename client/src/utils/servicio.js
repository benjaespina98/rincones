/**
 * Cómo servir un vino: temperatura y, sólo cuando sirve, si conviene airearlo.
 *
 * Son las temperaturas de manual por tipo (tomar un tinto a temperatura ambiente de un verano argentino es el error más
 * común y el más fácil de evitar). La ficha usa la misma tabla (ver WinePlan) y el Sommelier la muestra en cada vino de
 * tu bodega, así que las dos pantallas no pueden decir cosas distintas.
 */
export const TEMPERATURAS = {
  red: "16-18 °C",
  white: "8-10 °C",
  "rosé": "8-10 °C",
  sparkling: "6-8 °C",
  fortified: "12-14 °C",
};

/** Tintos de taninos firmes: los que ganan con un rato de aire. El resto no necesita que le digamos nada. */
const TANICOS = ["cabernet sauvignon", "tannat", "syrah", "petit verdot", "malbec"];

export const temperaturaDeServicio = (wine) => TEMPERATURAS[wine?.type] || "";

/**
 * ¿Conviene airearlo? Sólo un tinto de uva tánica, y no uno viejo (un tinto de más de 12 años se oxida rápido y lo que
 * pide es abrirlo con cuidado, no airearlo).
 */
export const conviene = (wine, anioActual = new Date().getFullYear()) => {
  if (wine?.type !== "red") return false;
  const uva = String(wine.varietal || "").toLowerCase();
  if (!TANICOS.some((t) => uva.includes(t))) return false;
  const cosecha = Number(wine.vintage);
  return !(Number.isFinite(cosecha) && cosecha > 0 && anioActual - cosecha > 12);
};

/**
 * ¿Es un tinto con años encima (10 o más)? Ahí el problema no es que le falte aire sino el sedimento: se decanta
 * despacio, de una sola vez, y se toma enseguida. Sin cosecha no se afirma nada.
 */
export const esTintoAnejo = (wine, anioActual = new Date().getFullYear()) => {
  if (wine?.type !== "red") return false;
  const cosecha = Number(wine.vintage);
  return Number.isFinite(cosecha) && cosecha > 0 && anioActual - cosecha >= 10;
};

/**
 * La línea para una tarjeta, según el vino:
 *   · tinto tánico y joven → «Servilo a 16-18 °C · airealo 30 min»
 *   · tinto con 10+ años   → «Servilo a 16-18 °C · decantalo con cuidado»
 *   · el resto             → «Servilo a 8-10 °C»
 * Vacía si no hay nada que decir.
 */
export const lineaDeServicio = (wine, anioActual) => {
  const temperatura = temperaturaDeServicio(wine);
  if (!temperatura) return "";
  if (esTintoAnejo(wine, anioActual)) return `Servilo a ${temperatura} · decantalo con cuidado`;
  return conviene(wine, anioActual) ? `Servilo a ${temperatura} · airealo 30 min` : `Servilo a ${temperatura}`;
};
