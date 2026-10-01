import { useEffect, useRef, useState } from "react";

/**
 * ¿El encabezado ya se tiene que ver compacto?
 *
 * ── POR QUÉ ESTO NO ES UN `scrollY > 40` ────────────────────────────────────
 * Porque en esta app el que scrollea no siempre es el mismo elemento. `body` no
 * scrollea; según cómo quede el layout, desborda `.app-content` o el documento
 * entero. Es el mismo problema que ya había resuelto `useSheet` para bloquear el
 * fondo, y ahí falló una vez de forma invisible: se le ponía `overflow: hidden`
 * a un elemento que no scrolleaba. Así que se pregunta por el COMPORTAMIENTO
 * —quién desborda de verdad— y no por el nombre.
 *
 * ── LA FRANJA MUERTA ────────────────────────────────────────────────────────
 * Un solo umbral hace que el encabezado parpadee cuando alguien se queda justo
 * en el límite: un píxel arriba y abajo lo prende y lo apaga. Por eso entra a
 * los 32 px y no vuelve hasta los 12: mientras el dedo tiembla en el medio, no
 * pasa nada.
 *
 * Se lee en `requestAnimationFrame` para no consultar el DOM en cada evento de
 * scroll, que en un teléfono llegan de a decenas por segundo.
 */
const ENTRA = 32;
const SALE = 12;

export function useHeaderCollapse() {
  const [compacto, setCompacto] = useState(false);
  const pendiente = useRef(false);

  useEffect(() => {
    const desborda = (el) => el && el.scrollHeight > el.clientHeight;
    const scrollerDe = () => {
      const contenido = document.querySelector(".app-content");
      return desborda(contenido) ? contenido : document.documentElement;
    };

    const medir = () => {
      pendiente.current = false;
      const y = scrollerDe().scrollTop || window.scrollY || 0;
      setCompacto((antes) => (antes ? y > SALE : y > ENTRA));
    };

    const alScrollear = () => {
      if (pendiente.current) return;
      pendiente.current = true;
      window.requestAnimationFrame(medir);
    };

    // Se escucha en captura y en el documento: así llega el scroll venga del
    // elemento que venga, sin tener que saber de antemano cuál es.
    document.addEventListener("scroll", alScrollear, { capture: true, passive: true });
    window.addEventListener("resize", alScrollear, { passive: true });
    medir();

    return () => {
      document.removeEventListener("scroll", alScrollear, { capture: true });
      window.removeEventListener("resize", alScrollear);
    };
  }, []);

  return compacto;
}
