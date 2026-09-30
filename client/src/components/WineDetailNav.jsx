import { useCallback, useEffect, useRef, useState } from "react";
import Segmented from "./Segmented";
import { tapHaptic } from "../utils/haptics";
import { irHasta } from "../utils/scroll";
import "./WineDetailNav.css";

/**
 * La barra que dice en qué parte de la ficha estás, y te lleva a otra.
 *
 * ── POR QUÉ NAVEGA Y NO ESCONDE ─────────────────────────────────────────────
 * La ficha mide 2753px medidos: casi cuatro pantallas de teléfono. Llegar a las
 * opiniones de la comunidad son tres scrolls completos, y hasta que no llegás
 * no sabés que existen.
 *
 * Lo obvio sería hacer pestañas y dejar una sección visible por vez. No se hizo,
 * y el motivo es que las pestañas esconden: alguien que entra por primera vez a
 * la ficha de un vino no sabe que hay un plan de comida ni opiniones de otros, y
 * con pestañas no se entera nunca — no va a tocar una palabra cuyo contenido no
 * imagina. La página sigue siendo una, se lee de arriba abajo la primera vez, y
 * esta barra es el atajo para la segunda.
 *
 * Es además la opción que no rompe nada: cada bloque queda donde estaba, con sus
 * refs, sus enlaces y sus flujos intactos.
 *
 * ── POR QUÉ NO ES UN IntersectionObserver ───────────────────────────────────
 * Fue lo primero que se escribió, con el `rootMargin` corrido para que una
 * sección contara como activa recién al cruzar el tercio alto de la pantalla. No
 * funciona acá, y se comprobó midiendo en el navegador: dos de los cuatro
 * anclajes son un `<h2>` de 14px de alto, así que la franja de 81px casi nunca
 * contiene a ninguno. Con la ficha scrolleada hasta "Cata", las cuatro secciones
 * estaban fuera de la franja y el observer no reportaba nada: la barra se
 * quedaba marcando "Resumen" para siempre, sin fallar ni avisar.
 *
 * Un observer contesta "¿esto está a la vista?" y la pregunta de acá es otra:
 * "¿cuál es la última sección que ya pasó la línea?". Esa siempre tiene
 * respuesta, incluso cuando ninguna está en una franja.
 *
 * ── QUIÉN SCROLLEA ─────────────────────────────────────────────────────────
 * No siempre el mismo elemento: según el layout desborda `.app-content` o el
 * documento. Por eso se escucha el scroll en captura sobre el documento —llega
 * venga de donde venga— y se lee la posición de las secciones con
 * `getBoundingClientRect`, que es relativa a la pantalla y no depende de quién
 * scrollea. Es la misma trampa que ya documenta `useHeaderCollapse`.
 */

/** La línea imaginaria: la sección que la cruzó es la que estás mirando. */
const LINEA = 140;
/** Cuánto ignorar al scroll tras un salto, para que el indicador no vaya parando
 *  en cada sección del camino como si alguien tocara los botones solo. */
const MS_DEL_SALTO = 700;

export default function WineDetailNav({ secciones, className = "" }) {
  const [activa, setActiva] = useState(secciones[0]?.id);
  const saltando = useRef(false);
  const temporizador = useRef(null);
  const pendiente = useRef(false);

  useEffect(() => {
    const medir = () => {
      pendiente.current = false;
      if (saltando.current) return;

      let actual = secciones[0]?.id;
      for (const s of secciones) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= LINEA) actual = s.id;
      }

      // El final del scroll marca la última sección aunque no haya llegado a la
      // línea: si no, la de abajo de todo —que nunca puede subir más— queda
      // imposible de marcar y tocarla no enciende nada.
      const doc = document.documentElement;
      const cont = document.querySelector(".app-content");
      const caja = cont && cont.scrollHeight > cont.clientHeight ? cont : doc;
      const alFondo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 8;
      if (alFondo) actual = secciones[secciones.length - 1]?.id ?? actual;

      setActiva(actual);
    };

    const alScrollear = () => {
      if (pendiente.current) return;
      pendiente.current = true;
      window.requestAnimationFrame(medir);
    };

    document.addEventListener("scroll", alScrollear, { capture: true, passive: true });
    window.addEventListener("resize", alScrollear, { passive: true });
    medir();

    return () => {
      document.removeEventListener("scroll", alScrollear, { capture: true });
      window.removeEventListener("resize", alScrollear);
    };
  }, [secciones]);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const ir = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    tapHaptic();
    setActiva(id);
    saltando.current = true;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      saltando.current = false;
    }, MS_DEL_SALTO);
    // `irHasta` y no `scrollIntoView` a secas: el CSS no puede apagar un
    // `behavior: "smooth"` escrito en JS. Ver utils/scroll.js.
    irHasta(el, { block: "start" });
  }, []);

  return (
    <div className={`wdnav ${className}`.trim()}>
      <Segmented
        options={secciones}
        value={activa}
        onChange={ir}
        ariaLabel="Secciones de la ficha"
        className="wdnav__seg"
      />
    </div>
  );
}
