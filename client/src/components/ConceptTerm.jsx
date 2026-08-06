import { useEffect, useState } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import { CONCEPTS, conceptAnchor } from "../data/wineConcepts";
import "../styles/components/SettingsSheet.css";
import "../styles/components/ConceptTerm.css";

/**
 * Una palabra que se puede tocar para saber qué significa.
 *
 * Envuelve un rótulo que YA está en pantalla —"Taninos", "Servila a 16-18 °C"—
 * y lo vuelve tocable. No agrega renglones, ni íconos de ayuda, ni una sección
 * nueva: lo único que cambia es un punteado tenue abajo, como una palabra con
 * definición.
 *
 * La explicación se abre en la misma hoja que la receta y los filtros: leés,
 * cerrás y seguís donde estabas. Cada término monta su propia hoja sólo cuando
 * está abierto, así que no hay estado global ni contexto que atravesar la app
 * para algo que se usa de a uno por vez.
 *
 * `ctx` es lo que la tarjeta necesita para escribir el renglón "en tu bodega"
 * (el vino, su ficha IA, su guarda). Es opcional: sin él, la tarjeta se lee
 * igual, sólo que general.
 */
export default function ConceptTerm({ id, ctx, children, className = "" }) {
  const [abierto, setAbierto] = useState(false);
  const concepto = CONCEPTS[id];

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Concepto inexistente, o que no aplica a este vino (taninos en un espumante):
  // se devuelve el contenido tal cual, sin volverlo tocable. Así el llamador no
  // tiene que preguntar nada antes de envolver un rótulo.
  if (!concepto || (concepto.appliesTo && ctx && !concepto.appliesTo(ctx.wine))) {
    return children;
  }

  const enTuBodega = abierto ? conceptAnchor(id, ctx || {}) : null;

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

      {abierto && (
        <Portal>
          <div className="settings-sheet" onClick={() => setAbierto(false)} role="presentation">
            <div
              className="settings-sheet__panel concept-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={concepto.title}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-sheet__head">
                <h2>{concepto.title}</h2>
                <button
                  type="button"
                  className="settings-sheet__close"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <div className="settings-sheet__body concept-sheet__body">
                <p className="concept-sheet__text">{concepto.body}</p>

                {/* Lo que ninguna enciclopedia puede decirte: cómo se aplica a la
                    botella que tenés adelante. Si el dato no está, no hay línea
                    —jamás se completa con una frase genérica—. */}
                {enTuBodega && (
                  <p className="concept-sheet__anchor">
                    <Icon name="bottle" size={14} />
                    <span>{enTuBodega}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
