import { useCallback, useRef, useState } from "react";

/**
 * Deslizar una fila hacia la izquierda para dejar a la vista sus acciones.
 *
 * ── DESLIZAR ABRE, NO EJECUTA ───────────────────────────────────────────────
 * El patrón de "deslizá del todo y se borra" es el que usan Mail y Gmail, y es
 * el que más rápido arruina algo: el gesto termina fuera de la vista, sin un
 * segundo de duda, y acá lo que se borra es un vino cargado a mano con su foto,
 * sus notas y sus momentos. Así que el gesto **revela** dos botones y no dispara
 * nada; el que borra sigue pidiendo confirmación, igual que desde el panel.
 *
 * ── NO PELEAR CON EL SCROLL ─────────────────────────────────────────────────
 * Una lista se scrollea con el mismo dedo. La dirección se decide UNA vez, en
 * los primeros píxeles del gesto: si el movimiento arrancó más vertical que
 * horizontal, esto se retira y no vuelve a mirar hasta el próximo toque. Sin ese
 * candado, cada scroll con el pulgar un poco torcido abría media docena de filas
 * al pasar.
 *
 * ── SÓLO CON UN DEDO, Y SÓLO SI ES UN DEDO ──────────────────────────────────
 * `pointerType === "mouse"` queda afuera: en escritorio hay hover y no hay razón
 * para esconder acciones detrás de un arrastre. Y con `prefers-reduced-motion`
 * el gesto sigue funcionando —se saca la transición, no la función—.
 */

/** Cuánto hay que arrastrar para que quede abierta al soltar. */
const UMBRAL = 44;
/** Hasta dónde se corre la fila cuando está abierta. Dos botones de 56px. */
export const ANCHO_ACCIONES = 112;
/** Antes de esto no se decide nada: es ruido del dedo apoyándose. */
const ZONA_MUERTA = 8;

export function useSwipeAcciones({ habilitado = true, onAbrir } = {}) {
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const gesto = useRef(null);

  const abierta = desplazamiento <= -UMBRAL;

  const cerrar = useCallback(() => setDesplazamiento(0), []);

  const alBajar = useCallback(
    (e) => {
      if (!habilitado || e.pointerType === "mouse") return;
      gesto.current = { x0: e.clientX, y0: e.clientY, eje: null, base: desplazamiento };
    },
    [habilitado, desplazamiento]
  );

  const alMover = useCallback((e) => {
    const g = gesto.current;
    if (!g) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;

    if (!g.eje) {
      if (Math.abs(dx) < ZONA_MUERTA && Math.abs(dy) < ZONA_MUERTA) return;
      // El candado: se decide una sola vez y no se revisa más en este gesto.
      g.eje = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.eje === "x") setArrastrando(true);
    }
    if (g.eje !== "x") return;

    // Sólo hacia la izquierda, y no más allá de donde están los botones: seguir
    // al dedo hasta el infinito deja la fila vacía en pantalla.
    const siguiente = Math.max(-ANCHO_ACCIONES, Math.min(0, g.base + dx));
    setDesplazamiento(siguiente);
  }, []);

  const alSoltar = useCallback(() => {
    const g = gesto.current;
    gesto.current = null;
    setArrastrando(false);
    if (!g || g.eje !== "x") return;
    setDesplazamiento((actual) => {
      const abre = actual <= -UMBRAL;
      if (abre && onAbrir) onAbrir();
      return abre ? -ANCHO_ACCIONES : 0;
    });
  }, [onAbrir]);

  return {
    desplazamiento,
    arrastrando,
    abierta,
    cerrar,
    /** Se esparce sobre el elemento que se arrastra. */
    manejadores: habilitado
      ? {
          onPointerDown: alBajar,
          onPointerMove: alMover,
          onPointerUp: alSoltar,
          onPointerCancel: alSoltar,
        }
      : {},
  };
}
