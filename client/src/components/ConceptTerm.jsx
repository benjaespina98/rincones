import { useState } from "react";
import ConceptSheet from "./ConceptSheet";
import { CONCEPTS } from "../data/wineConcepts";
import "../styles/components/ConceptTerm.css";

/**
 * Una palabra que se puede tocar para saber qué significa.
 *
 * Envuelve un rótulo que YA está en pantalla —"Taninos", "Servila a 16-18 °C"—
 * y lo vuelve tocable. No agrega renglones, ni íconos de ayuda, ni una sección
 * nueva: lo único que cambia es un punteado tenue abajo, como una palabra con
 * definición.
 *
 * La explicación la muestra `ConceptSheet`, en la misma hoja que la receta y
 * los filtros: leés, cerrás y seguís donde estabas. Acá quedó sólo el
 * disparador — el panel se separó cuando apareció un segundo lugar que lo abre
 * (la tarjeta de "Para aprender hoy"), porque envolverla en este componente le
 * contagiaba el subrayado punteado que corresponde a una palabra, no a una
 * tarjeta.
 *
 * `ctx` es lo que la hoja necesita para escribir el renglón "en tu bodega"
 * (el vino, su ficha IA, su guarda). Es opcional: sin él, se lee igual, sólo
 * que general.
 */
export default function ConceptTerm({ id, ctx, children, className = "" }) {
  const [abierto, setAbierto] = useState(false);
  const concepto = CONCEPTS[id];

  // Concepto inexistente, o que no aplica a este vino (taninos en un espumante):
  // se devuelve el contenido tal cual, sin volverlo tocable. Así el llamador no
  // tiene que preguntar nada antes de envolver un rótulo.
  if (!concepto || (concepto.appliesTo && ctx && !concepto.appliesTo(ctx.wine))) {
    return children;
  }

  return (
    <>
      <button
        type="button"
        className={`concept-term ${className}`}
        onClick={(e) => {
          // Muchos de estos rótulos viven dentro de tarjetas que abren otra
          // cosa al tocarlas. Sin esto, pedir una definición te sacaba de la
          // pantalla.
          e.stopPropagation();
          setAbierto(true);
        }}
        aria-label={`Qué es: ${concepto.title}`}
      >
        {children}
      </button>

      {abierto && <ConceptSheet id={id} ctx={ctx} onClose={() => setAbierto(false)} />}
    </>
  );
}
