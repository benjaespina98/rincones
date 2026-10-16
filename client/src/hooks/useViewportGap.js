import { useEffect } from "react";
import { calcularHueco } from "../utils/viewportGap";

/**
 * Corrige que la barra de abajo quede flotando arriba de una franja vacía al abrir
 * la PWA en iOS. Ver `utils/viewportGap.js` para el porqué y los límites.
 *
 * Hace dos cosas, en este orden:
 *  1. EMPUJA el recálculo: un `scrollTo` del documento es lo que el usuario hacía
 *     a mano ("tengo que bajarla manualmente") y hace que iOS vuelva a medir el
 *     viewport. Si alcanza, el hueco desaparece y no hay nada más que hacer.
 *  2. COMPENSA lo que quede: escribe `--vp-gap` en `:root` con el hueco medido y
 *     el CSS estira el shell y baja lo anclado abajo (barra, botón de agregar,
 *     compositor). Con hueco 0 —el caso de siempre— no cambia nada.
 *
 * Se vuelve a medir al volver a primer plano, al rotar y en cada resize: iOS
 * puede cambiar el viewport sin avisar.
 */
export const useViewportGap = () => {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const iosStandalone = window.navigator.standalone === true;
    if (!iosStandalone) return undefined;

    const raiz = document.documentElement;
    const timers = [];

    const medir = () => {
      const vertical = window.matchMedia?.("(orientation: portrait)")?.matches !== false;
      const { width, height } = window.screen;
      const pantallaAlto = vertical ? Math.max(width, height) : Math.min(width, height);
      const hueco = calcularHueco({
        iosStandalone,
        pantallaAlto,
        ventanaAlto: window.innerHeight,
      });
      raiz.style.setProperty("--vp-gap", `${hueco}px`);
    };

    const empujar = () => {
      window.scrollTo(0, 1);
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        medir();
      });
    };

    const alVolver = () => {
      if (document.visibilityState === "visible") empujar();
    };

    medir();
    empujar();
    // iOS termina de acomodar el viewport algo después del primer pintado.
    [120, 400, 1000].forEach((ms) => timers.push(setTimeout(empujar, ms)));

    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", empujar);
    window.addEventListener("pageshow", empujar);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", empujar);
      window.removeEventListener("pageshow", empujar);
      document.removeEventListener("visibilitychange", alVolver);
      raiz.style.removeProperty("--vp-gap");
    };
  }, []);
};
