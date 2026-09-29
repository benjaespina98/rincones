/**
 * Transiciones entre pantallas, con la View Transitions API.
 *
 * ── POR QUÉ NO UNA LIBRERÍA ─────────────────────────────────────────────────
 * Lo que se quiere es que la foto de la etiqueta de una tarjeta se convierta en
 * la foto grande de la ficha — un shared-element. Hacerlo a mano significa medir
 * las dos posiciones, clonar el nodo, animarlo y limpiarlo; con una librería,
 * sumar peso al bundle y un modelo de animación paralelo al CSS que ya usamos.
 *
 * El navegador lo hace solo: `startViewTransition` saca una foto del antes,
 * deja que React cambie el DOM y anima entre las dos. Los elementos que
 * comparten `view-transition-name` se morphean; el resto hace fade. Cero
 * kilobytes.
 *
 * ── DEGRADA A NO HACER NADA ─────────────────────────────────────────────────
 * Donde la API no existe, la navegación ocurre igual, sin animación. Eso es
 * exactamente lo que se quiere de una transición: si falla, no se rompe nada,
 * sólo se ve menos lindo. Nunca envolver lógica de datos acá dentro.
 *
 * ── reduced-motion NO ES "MÁS CORTO" ────────────────────────────────────────
 * Es "no". Quien lo activa suele hacerlo por mareo o vértigo, y una transición
 * de media pantalla es justo lo que le hace mal. Se saltea entera, y como la
 * navegación va por afuera, no pierde nada más que la animación.
 */

const soportada = () =>
  typeof document !== "undefined" && typeof document.startViewTransition === "function";

const prefiereQuieto = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Corre `accion` adentro de una transición cuando se puede, y derecho cuando no.
 *
 * `accion` tiene que ser lo que CAMBIA la pantalla (un `navigate`, un
 * `setState`), no lo que trae los datos: la API congela la pantalla hasta que
 * la función termina, así que meter una espera de red adentro deja la app
 * pintada como una foto durante todo el pedido.
 */
export function conTransicion(accion) {
  if (!soportada() || prefiereQuieto()) {
    accion();
    return;
  }
  document.startViewTransition(() => {
    accion();
  });
}

/**
 * El nombre que hace que dos elementos de pantallas distintas se reconozcan
 * como el mismo.
 *
 * Tiene que ser ÚNICO en cada pantalla: si dos tarjetas de la lista declaran el
 * mismo nombre, el navegador no sabe cuál es cuál y descarta la transición
 * entera —sin error—, así que se deriva del id del vino.
 *
 * Devuelve `undefined` sin id, para no poner un nombre repetido en todas las
 * tarjetas sin foto y arruinar la transición de las que sí la tienen.
 */
export function nombreDeFoto(wineId) {
  if (!wineId) return undefined;
  // Sólo letras, números y guiones: `view-transition-name` es un
  // <custom-ident>, y un ObjectId con algo raro lo invalidaría en silencio.
  const limpio = String(wineId).replace(/[^a-zA-Z0-9-]/g, "");
  return limpio ? `foto-vino-${limpio}` : undefined;
}
