import { useEffect, useRef, useState } from "react";
import { decimal } from "../utils/perfilDatos";

/**
 * Un número que se cuenta hasta llegar, en vez de aparecer ya puesto.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Las estadísticas del perfil eran cifras quietas: la pantalla se abría y ya
 * estaba todo ahí, como una foto. Contar hasta el valor (700ms, frenando al
 * final) es lo que hace que se sienta que la app las acaba de calcular para
 * vos. Es movimiento con significado: dice "esto es un resultado", no decora.
 *
 * ── LO QUE NO SE NEGOCIA ────────────────────────────────────────────────────
 *  · `prefers-reduced-motion`: el número aparece ya en su valor final.
 *  · Un lector de pantalla no tiene que oír "1, 3, 5, 8, 11": lo que se anima
 *    va oculto para él y se lee sólo el valor final.
 *  · Si el valor cambia más tarde (se recarga la bodega), cuenta desde donde
 *    estaba y no vuelve a cero.
 */
const DURACION = 700;

const prefiereQuieto = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function Contador({ valor, decimales = 0, duracion = DURACION }) {
  const destino = Number(valor) || 0;
  const quieto = prefiereQuieto() || typeof requestAnimationFrame !== "function";
  const [animado, setAnimado] = useState(0);
  const actual = useRef(0);

  useEffect(() => {
    if (quieto) return undefined;
    const desde = actual.current;
    const inicio = performance.now();
    let cuadro;

    const paso = (ahora) => {
      const avance = Math.min((ahora - inicio) / duracion, 1);
      const suave = 1 - (1 - avance) ** 3; // frena al final
      const v = desde + (destino - desde) * suave;
      actual.current = v;
      setAnimado(v);
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };

    cuadro = requestAnimationFrame(paso);

    /* Respaldo: `requestAnimationFrame` no corre en una pestaña oculta ni en algunos
       paneles incrustados, y un número que se queda en 0 es peor que uno que no se
       anima. Si la animación no llegó sola, el valor final se pone igual. */
    const respaldo = setTimeout(() => {
      actual.current = destino;
      setAnimado(destino);
    }, duracion + 150);

    return () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(respaldo);
    };
  }, [destino, duracion, quieto]);

  const formatear = (n) =>
    decimales > 0 ? decimal(n, decimales) : Math.round(n).toLocaleString("es-AR");

  const final = formatear(destino);
  if (quieto) return <>{final}</>;

  return (
    <>
      <span aria-hidden="true">{formatear(animado)}</span>
      <span className="sr-only">{final}</span>
    </>
  );
}
