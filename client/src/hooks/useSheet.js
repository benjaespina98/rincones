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
 * 4. **El Tab no se escapa.** Al llegar al último control del panel, Tab vuelve
 *    al primero en vez de seguir a la pantalla de atrás. Esto faltaba, y el
 *    comentario viejo lo justificaba diciendo que estas hojas son cortas — pero
 *    "corta" no cambia nada: apenas el foco se va del panel, quien navega con
 *    teclado queda tabulando por controles que no ve, debajo del velo, sin
 *    forma de saber dónde está. Un diálogo que no atrapa el foco no es un
 *    diálogo, es una capa de pintura.
 *
 *    Los candidatos se recalculan en CADA Tab y no una vez al abrir, porque el
 *    contenido de estas hojas cambia mientras están abiertas: los filtros
 *    despliegan secciones, el sheet de receta carga sus pasos. Una lista
 *    congelada al abrir dejaría afuera todo lo que apareció después.
 *
 * Devuelve el ref que hay que poner en el panel.
 */
export function useSheet(onClose, { enabled = true } = {}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    /**
     * ¿Está oculto?
     *
     * Una sección plegada tiene controles en el DOM que no se ven, y tabular
     * hacia ellos es perder el foco igual que perderlo fuera del panel.
     *
     * ── POR QUÉ NO SE MIDE CON offsetWidth ──────────────────────────────────
     * Era lo primero que se probó y está mal por dos motivos. Uno práctico: en
     * un entorno sin layout —jsdom, o sea los tests— todo mide cero, así que el
     * filtro se comía la lista entera y la trampa de foco quedaba sin candidatos
     * justo donde se la quería verificar. Y otro de criterio: medir el tamaño
     * confunde "oculto" con "todavía no se calculó el layout", que no es lo
     * mismo.
     *
     * `display` y `visibility` se resuelven sin layout y dicen exactamente lo
     * que hace falta. Lo que este chequeo NO ve —un padre con alto cero y
     * overflow oculto— cae del lado seguro: incluir un control de más sólo
     * agrega una parada en el ciclo; excluirlo de más lo deja inalcanzable.
     */
    const oculto = (el) => {
      const vista = el.ownerDocument?.defaultView;
      if (!vista) return false;
      const cs = vista.getComputedStyle(el);
      return cs.display === "none" || cs.visibility === "hidden";
    };

    /** Lo que puede recibir foco HOY dentro del panel, en orden de tabulación. */
    const enfocables = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return [
        ...panel.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.disabled && el.getAttribute("aria-hidden") !== "true" && !oculto(el));
    };

    const alTeclear = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = enfocables();
      if (items.length === 0) {
        // Un panel sin controles: el foco se queda en el panel mismo, que es
        // donde lo puso el efecto de abajo.
        e.preventDefault();
        return;
      }

      const primero = items[0];
      const ultimo = items[items.length - 1];
      const activo = document.activeElement;
      const panel = panelRef.current;

      // Si el foco quedó fuera del panel (pasó algo raro, o se abrió sin
      // teclado), la próxima tabulación lo trae de vuelta en vez de seguir
      // paseando por la pantalla de atrás.
      if (!panel?.contains(activo)) {
        e.preventDefault();
        primero.focus();
        return;
      }

      if (e.shiftKey && (activo === primero || activo === panel)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);

    /**
     * El contenedor que de verdad scrollea.
     *
     * Ojo con esto, que ya falló una vez de una forma invisible: se elegía
     * `.app-content` por existir, y `.app-content` NO siempre desborda. Su
     * `flex: 1 1 auto` sólo lo convierte en el scroller si su padre es un
     * contenedor flex de altura fija, y `.app-layout` es un bloque con
     * `min-height` — así que el elemento crece con el contenido, nunca
     * desborda, y el que scrollea es el documento. Resultado: se le ponía
     * `overflow: hidden` a un elemento que no scrolleaba y el fondo se seguía
     * moviendo detrás de cada hoja abierta, que es exactamente lo que este
     * bloque existe para impedir.
     *
     * Se pregunta por el comportamiento y no por el nombre: gana el primero que
     * de verdad desborde. Así funciona igual si mañana el layout cambia y
     * `.app-content` pasa a ser el scroller de nuevo.
     */
    const desborda = (el) => el && el.scrollHeight > el.clientHeight;
    const contenido = document.querySelector(".app-content");
    const scroller = desborda(contenido) ? contenido : document.documentElement;
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
