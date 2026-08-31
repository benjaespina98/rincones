/**
 * Las cuatro vistas de Mi Bodega y qué vino entra en cada una.
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
 *
 * ── LA CUARTA VISTA ────────────────────────────────────────────────────────
 * "Quiero probar" no sale de la colección: son los vinos que todavía NO tenés
 * (la wishlist, otra colección del server). Vive acá igual porque para el
 * usuario es una parte más de la misma pregunta —qué vinos hay en mi vida— y
 * porque la pantalla necesita un solo vocabulario de vistas para el segmentado.
 * Lo que cambia es de dónde salen las filas, no cómo se elige la vista.
 */

/** La vista que NO se alimenta de la colección, sino de la lista de deseos. */
export const VISTA_DESEOS = "quiero-probar";

/** El eje principal: qué parte de tu vida con el vino estás mirando. */
export const VISTAS = ["instock", "all", "probados", VISTA_DESEOS];

/**
 * Nombres viejos que se traducen en vez de ignorarse, para no romper un enlace
 * guardado ni la preferencia que quedó en el navegador.
 *
 *   historial  → "Probados" se llamó así hasta hace dos tandas.
 *   guardados  → era una PESTAÑA propia; hoy es esta vista. Cualquiera que
 *                tenga /guardados en favoritos aterriza donde esperaba.
 */
const RENOMBRADAS = { historial: "probados", guardados: VISTA_DESEOS, deseos: VISTA_DESEOS };

export const normalizarVista = (valor) => {
  const v = RENOMBRADAS[valor] || valor;
  return VISTAS.includes(v) ? v : null;
};

/** ¿Este vino de tu colección entra en esta vista? */
export const pasaVista = (vista, wine) => {
  // Ningún vino de la bodega entra acá: esta vista muestra los que NO tenés.
  // Devolver `false` y no `true` es lo que evita que "Quiero probar" se
  // convierta en un segundo "Todos" si alguien la usa por error para filtrar.
  if (vista === VISTA_DESEOS) return false;
  if (vista === "instock") return Number(wine?.quantity) > 0;
  // No mira el stock a propósito: que te queden botellas de algo que ya tomaste
  // no borra que lo tomaste, y reponerlo tampoco.
  if (vista === "probados") return wine?.tasted === true;
  return true;
};
