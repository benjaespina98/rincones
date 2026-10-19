import { useRef } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import { useSheet } from "../hooks/useSheet";
import { CONCEPTS, conceptAnchor } from "../data/wineConcepts";
import "../styles/shared/SettingsSheet.css";
import "../styles/shared/ConceptTerm.css";

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
          className="settings-sheet__panel settings-sheet__panel--feature concept-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={concepto.title}
        >
          {/* Mismo encabezado que cualquier hoja de la app (el círculo para
              cerrar, el alto, el borde de abajo) más el vocabulario de las
              hojas de LECTURA (`--feature`, ver SettingsSheet.css): el
              medallón y el rótulo son los mismos que la tarjeta "Aprendé
              sobre vino" que la dispara, así que abrir la hoja se siente como
              CONTINUAR esa tarjeta y no como entrar a un diálogo distinto.
              Sin esto, esta hoja y la de "Cambiar contraseña" eran,
              visualmente, el mismo componente con otro texto adentro. */}
          <div className="settings-sheet__head settings-sheet__head--feature">
            <span className="settings-sheet__icon" aria-hidden="true">
              <Icon name="graduation" size={17} />
            </span>
            <div className="settings-sheet__heading">
              <span className="settings-sheet__eyebrow">Aprendé sobre vino</span>
              <h2>{concepto.title}</h2>
            </div>
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

            {/* "En tu copa:" es lo único que se hace con la copa en la mano: qué notar. Es opcional
                y de todos los conceptos, no depende de ningún dato de tu bodega. */}
            {concepto.copa && (
              <p className="concept-sheet__text concept-sheet__copa">
                <strong>En tu copa:</strong> {concepto.copa}
              </p>
            )}

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
