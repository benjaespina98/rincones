import { useEffect, useRef } from "react";

/**
 * Lo que toda hoja/modal de la app tiene que hacer y ninguna hacía entera.
 *
 * Había OCHO componentes con su propio `keydown` de Escape copiado, dos con un
 * bloqueo de scroll que no bloqueaba nada, y ninguno que se ocupara del foco.
 * Cada uno resolvía la parte que a alguien le molestó ese día.
 *
 * Este hook hace las tres cosas, siempre:
 *
 * 1. **Escape cierra.** Es la tecla que el sistema operativo enseñó a usar.
 *
 * 2. **El fondo deja de scrollear.** `PhotoLightbox` y `ProfileEditor` ponían
 *    `document.body.style.overflow = "hidden"` — y no pasaba nada, porque en
 *    esta app el body NO scrollea: el que scrollea es `.app-content` (ver
 *    App.css). O sea que con un modal abierto se podía seguir moviendo la
 *    página de atrás con la rueda o con el dedo, que es la señal más clara de
 *    que un diálogo "no es de verdad". Se bloquea el contenedor real, y si no
 *    existe (login, panel de admin) se cae al elemento raíz.
 *
 * 3. **El foco entra y vuelve.** Al abrir, el foco se va al panel; al cerrar,
 *    vuelve al control que lo abrió. Sin esto, quien navega con teclado abría
 *    la hoja y seguía tabulando por la pantalla de atrás —invisible debajo del
 *    velo— sin forma de llegar a lo que acababa de abrir.
 *
 * Devuelve el ref que hay que poner en el panel.
 *
 * No es un focus trap completo (no cicla el Tab dentro del panel): eso pide
 * bastante más código y estas hojas son cortas. Lo que resuelve es el problema
 * real, que era empezar afuera.
 */
export function useSheet(onClose, { enabled = true } = {}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const alTeclear = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", alTeclear);

    // El contenedor que de verdad scrollea. `.app-content` dentro de la app;
    // fuera de ella (login, onboarding, panel) scrollea el documento.
    const scroller = document.querySelector(".app-content") || document.documentElement;
    const overflowPrevio = scroller.style.overflow;
    scroller.style.overflow = "hidden";

    // Quién tenía el foco antes, para devolvérselo. `activeElement` puede ser
    // el body si se llegó acá sin teclado: en ese caso no hay nada que devolver.
    const previo = document.activeElement;
    panelRef.current?.focus?.();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      scroller.style.overflow = overflowPrevio;
      if (previo instanceof HTMLElement && previo !== document.body) previo.focus?.();
    };
  }, [onClose, enabled]);

  return panelRef;
}
