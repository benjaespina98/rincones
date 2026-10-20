import { useCallback, useEffect, useRef } from "react";

/**
 * Mantener apretado: dispara `onLongPress` después de `ms` sin soltar y sin mover el dedo.
 *
 * Devuelve los handlers para poner en el elemento y `fueLarga()`, que dice si el último toque
 * fue una pulsación larga: el `click` que viene al soltar tiene que ignorarse, o abriría la ficha
 * justo después de haber entrado en la selección.
 *
 * Si el dedo se mueve más de `tolerancia` px (es un scroll) o el navegador cancela el gesto, no
 * dispara. El menú contextual del navegador (el que aparece al mantener apretado) se suprime
 * mientras dura el gesto, para que no tape la selección.
 */
export function useLongPress(onLongPress, { ms = 450, tolerancia = 10, habilitado = true } = {}) {
  const timer = useRef(null);
  const origen = useRef(null);
  const larga = useRef(false);
  const callback = useRef(onLongPress);

  useEffect(() => {
    callback.current = onLongPress;
  }, [onLongPress]);

  const cancelar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origen.current = null;
  }, []);

  useEffect(() => cancelar, [cancelar]);

  const alBajar = useCallback(
    (e) => {
      if (!habilitado) return;
      // Sólo el botón principal del mouse; el toque no trae `button` distinto de 0.
      if (e.button !== undefined && e.button !== 0) return;
      larga.current = false;
      origen.current = { x: e.clientX, y: e.clientY };
      cancelar();
      origen.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        larga.current = true;
        callback.current?.();
      }, ms);
    },
    [habilitado, ms, cancelar]
  );

  const alMover = useCallback(
    (e) => {
      if (!origen.current || !timer.current) return;
      const dx = Math.abs(e.clientX - origen.current.x);
      const dy = Math.abs(e.clientY - origen.current.y);
      if (dx > tolerancia || dy > tolerancia) cancelar();
    },
    [tolerancia, cancelar]
  );

  const alContexto = useCallback((e) => {
    // El menú del navegador al mantener apretado taparía la selección que recién se abrió.
    if (larga.current || timer.current) e.preventDefault();
  }, []);

  return {
    handlers: {
      onPointerDown: alBajar,
      onPointerMove: alMover,
      onPointerUp: cancelar,
      onPointerLeave: cancelar,
      onPointerCancel: cancelar,
      onContextMenu: alContexto,
    },
    fueLarga: () => {
      const v = larga.current;
      larga.current = false;
      return v;
    },
  };
}
