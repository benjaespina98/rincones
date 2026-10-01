import { useEffect, useState } from "react";

const prefiereQuieto = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * El texto de ayuda de un campo, rotando entre ejemplos.
 *
 * Es lo que hacen los chats de IA con su campo vacío: no dicen siempre lo mismo,
 * muestran de a poco todo lo que se les puede preguntar. Un placeholder fijo se lee
 * una vez y se vuelve invisible; uno que cambia enseña cosas.
 *
 * Sólo rota mientras `activo` (el campo está vacío y sin foco: cambiar el texto de
 * ayuda mientras alguien escribe sería distraerlo), con la pestaña visible y sin
 * `prefers-reduced-motion`. Empieza siempre en la primera frase.
 */
export function usePlaceholderRotativo(frases, { activo = true, cada = 5500 } = {}) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (!activo || frases.length < 2 || prefiereQuieto()) return undefined;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setIndice((i) => (i + 1) % frases.length);
    }, cada);
    return () => clearInterval(id);
  }, [activo, cada, frases.length]);

  return frases[indice % frases.length] || "";
}
