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
 * Las combinaciones son normales y ninguna implica a la otra. Por eso "En
 * stock" mira el stock y "Probados" mira si lo tomaste — un vino puede estar
 * en las dos a la vez, y está bien que así sea.
 *
 * ── POR QUÉ YA NO HAY UNA CUARTA VISTA "TODOS" ──────────────────────────────
 * Reportado así: "¿cuál es la diferencia de 'Todos' con el resto?" — y
 * mirando qué vino entra EXCLUSIVAMENTE ahí (ni en stock, ni probado, ni
 * favorito, ni en la wishlist), la respuesta era "casi nada": un vino que
 * cargaste, nunca abriste, ya no tenés y nunca te gustó lo suficiente como
 * para marcarlo. Un caso raro, y que además sigue siendo encontrable: buscar
 * por nombre ya amplía la búsqueda a TODA la bodega aunque la vista actual no
 * lo muestre (ver `resultados.ampliada` en BodyPage.jsx, que filtra sobre
 * `wines` entero y no pasa por `pasaVista`). Sacarla deja tres pestañas que
 * contestan cada una una pregunta concreta, en vez de una cuarta que no
 * contestaba ninguna que las otras tres (más la búsqueda) no contestaran ya.
 *
 * ── LA TERCERA VISTA: FAVORITOS ─────────────────────────────────────────────
 * Se llamaba "Quiero probar" y mostraba SÓLO la wishlist (los vinos que
 * todavía no tenés). El nombre dejaba afuera un caso real: marcar un vino que
 * SÍ tenés como favorito porque te gusta, no porque quieras "conseguirlo" —
 * ahí "Quiero probar" mentía. Ahora la vista junta las dos cosas que antes
 * vivían separadas bajo dos nombres de "favorito" distintos (el corazón de un
 * vino tuyo, y estar anotado en la wishlist): cualquier vino que tengas Y
 * hayas marcado con el corazón entra acá, además de todo lo que tengas
 * anotado para conseguir. Lo que cambia es de dónde salen las filas —de la
 * colección real, de la wishlist, o de las dos—, no cómo se elige la vista.
 */

/** La vista que combina lo tuyo marcado como favorito con la lista de deseos. */
export const VISTA_DESEOS = "quiero-probar";

/** El eje principal: qué parte de tu vida con el vino estás mirando. */
/**
 * Los vinos que no entran en ninguna de las otras tres: sin botellas, sin probar y sin corazón.
 *
 * Es la vista que le faltaba al modelo. Con tres ejes independientes hay una combinación que no tenía lugar
 * (quantity 0, tasted false, favorite false) y se alcanza por caminos normales: sacar la última botella
 * «sin tomarla» (la regalaste, te equivocaste), desmarcar «ya probado» de un vino que no te queda, o
 * corregir la cantidad a cero. El vino seguía guardado, con su historial, pero no aparecía en NINGUNA pestaña:
 * desde la pantalla era indistinguible de uno borrado. Antes se decidió sacar «Todos» porque ese caso era
 * raro; ahora no lo es, y la solución no es volver a una pestaña que repite a las otras sino darle lugar sólo
 * a lo que no lo tiene (el segmentado la muestra únicamente cuando hay alguno).
 */
export const VISTA_SIN_STOCK = "sin-stock";

export const VISTAS = ["instock", "probados", VISTA_DESEOS, VISTA_SIN_STOCK];

/**
 * Nombres viejos que se traducen en vez de ignorarse, para no romper un enlace
 * guardado ni la preferencia que quedó en el navegador.
 *
 *   historial  → "Probados" se llamó así hasta hace dos tandas.
 *   guardados  → era una PESTAÑA propia; hoy es esta vista. Cualquiera que
 *                tenga /guardados en favoritos aterriza donde esperaba.
 *   all        → "Todos" se sacó del segmentado (ver el comentario grande de
 *                arriba). Un enlace viejo con `?vista=all` cae en "instock",
 *                que es el default de todos modos.
 */
const RENOMBRADAS = { historial: "probados", guardados: VISTA_DESEOS, deseos: VISTA_DESEOS, all: "instock" };

export const normalizarVista = (valor) => {
  const v = RENOMBRADAS[valor] || valor;
  return VISTAS.includes(v) ? v : null;
};

/** ¿Este vino de tu colección entra en esta vista? */
export const pasaVista = (vista, wine) => {
  // Sólo los favoritos: es la mitad de "Favoritos" que sale de tu colección
  // real (la otra mitad es la wishlist, que la pantalla suma aparte porque
  // vive en otra colección del server).
  if (vista === VISTA_DESEOS) return wine?.favorite === true;
  if (vista === "instock") return Number(wine?.quantity) > 0;
  // Exclusiva a propósito: lo probado vive en «Ya tomados» y lo que tiene corazón en «Favoritos», aunque no
  // les queden botellas. Acá sólo entra lo que, si no, no estaría en ningún lado.
  if (vista === VISTA_SIN_STOCK) {
    return !(Number(wine?.quantity) > 0) && wine?.tasted !== true && wine?.favorite !== true;
  }
  // No mira el stock a propósito: que te queden botellas de algo que ya tomaste
  // no borra que lo tomaste, y reponerlo tampoco.
  return wine?.tasted === true;
};
