/**
 * Las tres vistas de Mi Bodega y qué vino entra en cada una.
 *
 * ── POR QUÉ ESTO VIVE APARTE ────────────────────────────────────────────────
 * Porque es una regla de negocio, no una decisión de pantalla, y porque se
 * rompió una vez de una forma que no se ve leyendo el código: la tercera vista se
 * llamaba "Historial" y preguntaba `quantity <= 0`, que es otra cosa —"no me
 * queda ninguna"—. El resultado, reportado desde la app: tomabas tu última
 * botella, el vino aparecía en el historial, comprabas otra, tocabas "+" y el
 * vino DESAPARECÍA del historial. Reponer stock borraba el hecho de haberlo
 * tomado.
 *
 * Son DOS hechos independientes y estaban colapsados en uno:
 *
 *              │ sin probar          │ probado
 *   ───────────┼─────────────────────┼──────────────────────────────
 *   con stock  │ te espera           │ lo tomaste y te queda más
 *   sin stock  │ lo perdiste o no lo │ lo tomaste y se te terminó
 *              │ cargaste bien       │
 *
 * Las cuatro combinaciones son normales y ninguna implica a la otra. Por eso
 * "En stock" mira el stock, "Probados" mira si lo tomaste, y "Todos" no mira
 * nada. Un vino puede estar en las tres a la vez, y está bien que así sea.
 */

/** El eje principal: qué parte de la colección estás mirando. */
export const VISTAS = ["instock", "all", "probados"];

/**
 * "Historial" fue el nombre viejo de "Probados". Se traduce en vez de ignorarse
 * para no romper un enlace guardado ni la preferencia que quedó en el navegador.
 */
const RENOMBRADAS = { historial: "probados" };

export const normalizarVista = (valor) => {
  const v = RENOMBRADAS[valor] || valor;
  return VISTAS.includes(v) ? v : null;
};

/** ¿Este vino entra en esta vista? */
export const pasaVista = (vista, wine) => {
  if (vista === "instock") return Number(wine?.quantity) > 0;
  // No mira el stock a propósito: que te queden botellas de algo que ya tomaste
  // no borra que lo tomaste, y reponerlo tampoco.
  if (vista === "probados") return wine?.tasted === true;
  return true;
};
