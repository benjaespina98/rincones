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
 * Se monta una única vez, en `AppLayout` (el envoltorio de toda la app): la
 * barra de navegación vive ahí, y corrige cualquier pantalla con un teclado
 * abierto — no sólo el Sommelier.
 */
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
};
