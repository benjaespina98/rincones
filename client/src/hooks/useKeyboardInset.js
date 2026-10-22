import { useEffect, useRef } from "react";

/**
 * Corrige que la barra de navegación quede pegada en el lugar equivocado
 * después de que el teclado se cierra, en iOS Safari.
 *
 * ── EL BUG QUE ARREGLA ───────────────────────────────────────────────────────
 * Se reportó así: "cuando el teclado se contrae, Descubrí y Mi Bodega quedan
 * más arriba de donde estaban". Mientras el teclado está ABIERTO, Safari ya
 * reubica solo los elementos `position: fixed` por encima de él —por eso se
 * puede escribir y mandar el mensaje sin que nada se vea mal—. El problema es
 * el momento del CIERRE: Safari no siempre vuelve a pintar esos elementos en
 * su posición de reposo hasta el próximo scroll, y la barra queda flotando en
 * la altura que tenía con el teclado arriba.
 *
 * ── POR QUÉ NO ES "MOVER LA BARRA CON EL TECLADO" ───────────────────────────
 * La solución de manual —escribir cuánto mide el teclado en una variable CSS y
 * usarla como `bottom`— parece la obvia, pero DUPLICARÍA el ajuste: Safari ya
 * mueve la barra sola mientras el teclado está abierto, así que sumarle un
 * offset propio la empujaría el doble de arriba de lo que corresponde —un bug
 * nuevo por arreglar uno viejo. Lo único que hace falta es el empujón que
 * fuerza a Safari a recalcular DESPUÉS de cerrarse, no una posición nueva.
 *
 * ── EL EMPUJÓN ───────────────────────────────────────────────────────────────
 * Un `scrollTo` de la ventana —no del contenido, que vive en su propio
 * `.app-content` con scroll independiente— es el truco mínimo y más citado
 * para esto: no mueve nada a la vista, pero le avisa al motor de layout que
 * tiene que revisar dónde va cada `fixed`.
 *
 * ── LA BARRA SE ESCONDE MIENTRAS SE ESCRIBE ────────────────────────────────
 * Con el teclado abierto la barra de pestañas quedaba flotando encima de él, comiéndose media pantalla
 * justo cuando hay que ver lo que se escribe. Mientras un campo de texto tiene el foco se marca
 * `<html data-teclado="abierto">` y el CSS esconde la barra (ver BottomTabNavigation.css). Se usa el foco
 * y no sólo el tamaño del viewport porque es lo que dispara el teclado en todos los navegadores, y el tamaño
 * llega tarde (o no llega) en el modo "agregada a la pantalla de inicio" de iOS.
 *
 * Se monta una única vez, en `AppLayout` (el envoltorio de toda la app): la
 * barra de navegación vive ahí, y corrige cualquier pantalla con un teclado
 * abierto — no sólo el Sommelier.
 */
const CAMPO_DE_TEXTO =
  'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]), [contenteditable=""], [contenteditable="true"]';

const esCampoDeTexto = (el) => Boolean(el?.matches?.(CAMPO_DE_TEXTO));

export const useKeyboardInset = () => {
  // Cuánto tenía que medir la ventana SIN teclado, para comparar contra eso y
  // no contra un umbral fijo — la altura real varía según el modelo de
  // teléfono y si el navegador mostró u ocultó su propia barra de URL.
  const alturaSinTeclado = useRef(
    typeof window !== "undefined" ? window.innerHeight : 0
  );

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    // Sin Visual Viewport API (navegador viejo): no hay nada que corregir
    // acá — no es peor que antes, sigue con el comportamiento de siempre.
    if (!vv) return undefined;

    let tecladoAbierto = false;

    const alAmbiar = () => {
      // Más de 100px de diferencia es un teclado de verdad, no el vaivén de
      // la barra de direcciones al hacer scroll (eso mueve unos 40-60px).
      const inset = alturaSinTeclado.current - vv.height - vv.offsetTop;
      const abierto = inset > 100;

      if (tecladoAbierto && !abierto) {
        // Se acaba de cerrar: el empujón que hace que Safari repinte los
        // elementos fijos en su lugar de reposo, en vez de esperar al
        // próximo scroll manual de quien esté usando la app.
        requestAnimationFrame(() => window.scrollTo(0, 0));
      }
      tecladoAbierto = abierto;
    };

    vv.addEventListener("resize", alAmbiar);
    return () => vv.removeEventListener("resize", alAmbiar);
  }, []);

  // Barra escondida mientras se escribe: ver el comentario de arriba.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const raiz = document.documentElement;
    let espera;
    const abrir = (e) => {
      if (!esCampoDeTexto(e.target)) return;
      clearTimeout(espera);
      raiz.dataset.teclado = "abierto";
    };
    const cerrar = () => {
      clearTimeout(espera);
      // El foco pasa de un campo a otro sin que el teclado se cierre: se mira dónde quedó.
      espera = setTimeout(() => {
        if (!esCampoDeTexto(document.activeElement)) delete raiz.dataset.teclado;
      }, 120);
    };
    document.addEventListener("focusin", abrir);
    document.addEventListener("focusout", cerrar);
    return () => {
      clearTimeout(espera);
      document.removeEventListener("focusin", abrir);
      document.removeEventListener("focusout", cerrar);
      delete raiz.dataset.teclado;
    };
  }, []);
};
