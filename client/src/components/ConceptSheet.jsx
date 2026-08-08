import { useEffect } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import { CONCEPTS, conceptAnchor } from "../data/wineConcepts";
import "../styles/components/SettingsSheet.css";
import "../styles/components/ConceptTerm.css";

/**
 * La hoja que explica un concepto. Sólo el panel: quién la abre es problema de
 * otro.
 *
 * Vivía dentro de `ConceptTerm`, que además es la palabra subrayada que la
 * dispara. Mientras el único disparador fue esa palabra, tenerlo todo junto
 * estaba bien. Cuando apareció el segundo —la tarjeta de "Para aprender hoy"—
 * las dos cosas empezaron a estorbarse: para reusar la hoja había que envolver
 * la tarjeta en un `ConceptTerm`, y entonces la tarjeta heredaba el
 * `text-decoration: underline dotted` pensado para una palabra en línea. El
 * resultado eran tres renglones punteados dentro de una tarjeta.
 *
 * Separar el panel del disparador arregla eso de raíz y deja una sola
 * implementación de la hoja, que es lo que se quería desde el principio.
 */
export default function ConceptSheet({ id, ctx, onClose }) {
  const concepto = CONCEPTS[id];

  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onClose]);

  if (!concepto) return null;

  const enTuBodega = conceptAnchor(id, ctx || {});

  return (
    <Portal>
      <div className="settings-sheet" onClick={onClose} role="presentation">
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
              onClick={onClose}
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
  );
}
