/**
 * Llevar la pantalla hasta un elemento, respetando "reducir movimiento".
 *
 * ── POR QUÉ ESTO NO LO ARREGLA EL CSS ───────────────────────────────────────
 * `index.css` pone `scroll-behavior: auto !important` dentro de
 * `@media (prefers-reduced-motion: reduce)`, y con eso alcanza para todo el
 * scroll suave que se declara en una hoja de estilos. Pero un
 * `scrollIntoView({ behavior: "smooth" })` escrito en JS gana igual: la opción
 * que se pasa en la llamada no la pisa ninguna regla de CSS.
 *
 * O sea que la app tenía tres lugares —la barra de secciones de la ficha, el
 * hilo del Sommelier y el salto al diario— donde quien activó la preferencia
 * igual se comía media pantalla deslizándose. Es justo el movimiento que le
 * hace mal a alguien que la activó por mareo o vértigo.
 *
 * Se centraliza acá para que el próximo `scrollIntoView` que alguien escriba
 * tenga un lugar obvio del que salir, en vez de repetir el chequeo (o
 * olvidarlo, que es lo que venía pasando).
 */

const prefiereQuieto = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {Element|null|undefined} el  El destino. Si no existe, no hace nada.
 * @param {ScrollIntoViewOptions} opciones  `block`, `inline`… `behavior` lo
 *   decide esta función y se ignora si viene.
 */
export function irHasta(el, opciones = {}) {
  if (!el?.scrollIntoView) return;
  el.scrollIntoView({
    ...opciones,
    behavior: prefiereQuieto() ? "auto" : "smooth",
  });
}
