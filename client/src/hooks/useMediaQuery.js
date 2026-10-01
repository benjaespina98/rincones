import { useCallback, useSyncExternalStore } from "react";

/**
 * ¿Se cumple esta media query? Y se entera cuando cambia (girar el teléfono,
 * redimensionar la ventana).
 *
 * Existe porque algunas decisiones no se pueden tomar sólo con CSS: el panel de
 * conversaciones del Sommelier es un cajón modal en un teléfono —atrapa el foco y
 * se cierra con Escape— y una columna fija en escritorio, donde atrapar el foco
 * sería un error. Cuál de los dos es no es un estilo, es comportamiento.
 *
 * Sin `matchMedia` (los tests, un entorno raro) responde `false`: el caso móvil,
 * que es el que no puede romper nada.
 */
export function useMediaQuery(query) {
  const suscribir = useCallback(
    (aviso) => {
      const lista = typeof window !== "undefined" ? window.matchMedia?.(query) : null;
      lista?.addEventListener?.("change", aviso);
      return () => lista?.removeEventListener?.("change", aviso);
    },
    [query]
  );

  const leer = () =>
    typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches);

  return useSyncExternalStore(suscribir, leer, () => false);
}
