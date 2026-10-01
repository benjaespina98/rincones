import { useEffect, useRef } from "react";

/**
 * Llama a `alRotar` cada tanto, SOLO cuando nadie lo está usando. Es la misma lógica de las
 * sugerencias de los chats de IA que ya sigue `FilaDeAtajos`, para algo que no es una fila:
 * la recomendación grande de Descubrí.
 *
 *   · DESPACIO y con un poco de azar (±40%): a intervalos exactos se nota el metrónomo.
 *   · NUNCA MIENTRAS SE USA: se frena con el mouse o el dedo encima, con foco adentro, diez
 *     segundos después de cualquier toque y con la pestaña oculta.
 *   · NADA SE MUEVE SOLO CON `prefers-reduced-motion`: contenido que cambia solo es justo lo
 *     que esa preferencia existe para evitar (WCAG 2.2.2 pide poder pausarlo).
 *
 * Devuelve las props que hay que poner en el contenedor para que sepa cuándo hay alguien ahí.
 * `alRotar` puede cambiar de identidad en cada render: se guarda en un ref para que el
 * temporizador no se reinicie por eso.
 */
const PAUSA_TRAS_INTERACCION_MS = 10000;

const prefiereQuieto = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function useRotacionAutomatica({ activo, alRotar, cada = 9000 }) {
  const alRotarRef = useRef(alRotar);
  const ultimaInteraccion = useRef(0);
  const encima = useRef(false);

  useEffect(() => {
    alRotarRef.current = alRotar;
  });

  useEffect(() => {
    if (!activo || prefiereQuieto()) return undefined;

    let espera;
    const programar = () => {
      espera = setTimeout(rotar, cada + Math.random() * cada * 0.4);
    };
    const rotar = () => {
      const quieto =
        (typeof document !== "undefined" && document.hidden) ||
        encima.current ||
        Date.now() - ultimaInteraccion.current < PAUSA_TRAS_INTERACCION_MS;
      if (!quieto) alRotarRef.current?.();
      programar();
    };

    programar();
    return () => clearTimeout(espera);
  }, [activo, cada]);

  const tocar = () => {
    ultimaInteraccion.current = Date.now();
  };

  return {
    onPointerEnter: () => {
      encima.current = true;
    },
    onPointerLeave: () => {
      encima.current = false;
      tocar();
    },
    onPointerDown: tocar,
    onFocusCapture: tocar,
  };
}
