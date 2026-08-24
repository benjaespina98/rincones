import { useRef } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import { useSheet } from "../hooks/useSheet";
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
  // Escape, bloqueo del scroll de atrás y manejo del foco: ver hooks/useSheet.
  const panelRef = useSheet(onClose, { enabled: Boolean(concepto) });

  /**
   * Dónde EMPEZÓ el gesto que termina cerrando.
   *
   * El cierre colgaba de un `onClick` en el velo, y un click cuenta como tal
   * aunque haya empezado adentro del panel: seleccionar una palabra de la
   * explicación y soltar el dedo un poco afuera cerraba la hoja y se llevaba la
   * selección. Ahora sólo cierra si el gesto nació en el velo, que es lo que
   * significa "toqué afuera".
   */
  const gestoDesdeElVelo = useRef(false);

  if (!concepto) return null;

  const enTuBodega = conceptAnchor(id, ctx || {});

  return (
    <Portal>
      <div
        className="settings-sheet"
        role="presentation"
        onPointerDown={(e) => { gestoDesdeElVelo.current = e.target === e.currentTarget; }}
        onClick={(e) => {
          if (e.target === e.currentTarget && gestoDesdeElVelo.current) onClose();
        }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="settings-sheet__panel concept-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={concepto.title}
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
            {/* El cuerpo va en párrafos, no en un bloque único: un concepto
                explicado en cinco oraciones seguidas se lee como una pared de
                texto, y acá cada idea (qué es → qué implica en la copa) ya
                tenía un quiebre natural. `body` puede llegar como string viejo
                por las dudas, pero todos los conceptos ya son arreglos. */}
            {(Array.isArray(concepto.body) ? concepto.body : [concepto.body]).map((parrafo, i) => (
              <p className="concept-sheet__text" key={i}>
                {parrafo}
              </p>
            ))}

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
