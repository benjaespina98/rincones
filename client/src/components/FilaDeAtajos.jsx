import { Fragment, useEffect, useRef, useState } from "react";

/**
 * Una fila de atajos que se renueva SOLA, de a uno, como las sugerencias de los
 * chats de IA.
 *
 * ── LA LÓGICA, COMO LA HACEN CLAUDE, GEMINI Y CHATGPT ───────────────────────
 *   · DE A UNO. Cada tanto sale un atajo y entra otro en su lugar, con un cruce
 *     suave. Cambiar la fila entera de golpe se lee como un parpadeo; cambiar uno
 *     se lee como algo vivo.
 *   · DESPACIO. Cada 7 segundos más o menos (con un poco de azar para que no sea
 *     un metrónomo). Más rápido cansa y no da tiempo a leer.
 *   · NUNCA CUANDO LA PERSONA ESTÁ USÁNDOLOS. Se frena mientras pasás el mouse o
 *     el dedo por la fila, mientras hay foco adentro, durante diez segundos
 *     después de cualquier toque, cuando la pestaña está oculta y cuando el
 *     contenedor lo pide (`pausado`: por ejemplo, mientras se escribe).
 *   · NADA SE MUEVE SOLO CON `prefers-reduced-motion`. Contenido que cambia solo
 *     es el caso que esa preferencia existe para evitar (y WCAG 2.2.2 pide poder
 *     pausarlo): quien la tiene activa ve la fila fija.
 *
 * ── CÓMO SE USA ─────────────────────────────────────────────────────────────
 *   `inicial`     los atajos de arranque. Cada uno es un objeto con `label`; los que
 *                 llevan `fijo: true` NO rotan (las preguntas que dependen de la
 *                 bodega: que "¿Qué abro hoy?" desaparezca y vuelva sería ruido).
 *   `siguiente`   recibe los atajos que están a la vista y devuelve uno distinto, o
 *                 null si no queda ninguno. La fila no sabe de dónde salen.
 *   `renderItem`  dibuja un atajo: (item, { indice, entra, saliendo }) => elemento.
 *                 `saliendo` es true durante la salida; `entra` es el orden de
 *                 entrada (0 para uno que reemplaza, así no espera a los demás).
 *
 * `inicial` se lee UNA vez al montar. Si los datos de los que depende cambian, quien
 * usa la fila le cambia la `key` y se vuelve a montar; adentro no se sincroniza con
 * un efecto que pise lo que ya rotó.
 */
const SALIDA_MS = 240;
const PAUSA_TRAS_INTERACCION_MS = 10000;

const prefiereQuieto = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function FilaDeAtajos({
  inicial,
  siguiente,
  renderItem,
  className = "",
  pausado = false,
  cada = 7000,
}) {
  const [items, setItems] = useState(() => inicial.map((x, i) => ({ ...x, uid: i })));
  const [saliendo, setSaliendo] = useState(-1);
  // Cuántos había al montar: los que llegan después entran sin esperar a los demás.
  const [cantidadInicial] = useState(inicial.length);

  const itemsRef = useRef(items);
  const siguienteRef = useRef(siguiente);
  const cursor = useRef(0);
  const uid = useRef(inicial.length);
  const ultimaInteraccion = useRef(0);
  const encima = useRef(false);

  // La función `siguiente` suele definirse en línea y cambiar de identidad en cada
  // render: se guarda en un ref para que el temporizador no se reinicie por eso.
  useEffect(() => {
    itemsRef.current = items;
    siguienteRef.current = siguiente;
  });

  useEffect(() => {
    if (pausado || prefiereQuieto()) return undefined;

    let espera;
    let salida;

    const programar = () => {
      // Con un poco de azar: una fila que cambia cada exactamente 7s se nota.
      espera = setTimeout(rotar, cada + Math.random() * cada * 0.4);
    };

    const rotar = () => {
      const quieto =
        typeof document !== "undefined" && document.hidden
          ? true
          : encima.current || Date.now() - ultimaInteraccion.current < PAUSA_TRAS_INTERACCION_MS;
      const actuales = itemsRef.current;
      const rotables = actuales.map((it, i) => (it.fijo ? -1 : i)).filter((i) => i >= 0);

      if (quieto || rotables.length === 0) return programar();

      // Round-robin entre los que pueden rotar: así cambian todos, no siempre el mismo.
      const posicion = rotables[cursor.current % rotables.length];
      cursor.current += 1;

      const nuevo = siguienteRef.current?.(actuales);
      if (!nuevo) return programar();

      setSaliendo(posicion);
      salida = setTimeout(() => {
        setItems((prev) =>
          prev.map((it, i) => (i === posicion ? { ...nuevo, uid: (uid.current += 1) } : it))
        );
        setSaliendo(-1);
        programar();
      }, SALIDA_MS);
      return undefined;
    };

    programar();
    return () => {
      clearTimeout(espera);
      clearTimeout(salida);
    };
  }, [pausado, cada]);

  const tocar = () => {
    ultimaInteraccion.current = Date.now();
  };

  return (
    <div
      className={className}
      onPointerEnter={() => {
        encima.current = true;
      }}
      onPointerLeave={() => {
        encima.current = false;
        tocar();
      }}
      onPointerDown={tocar}
      onFocusCapture={tocar}
      onScroll={tocar}
    >
      {items.map((item, indice) => (
        <Fragment key={item.uid}>
          {renderItem(item, {
            indice,
            entra: item.uid < cantidadInicial ? indice : 0,
            saliendo: indice === saliendo,
          })}
        </Fragment>
      ))}
    </div>
  );
}
