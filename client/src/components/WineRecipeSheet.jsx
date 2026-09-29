import Icon from "./Icon";
import Portal from "./Portal";
import ConceptTerm from "./ConceptTerm";
import { useSheet } from "../hooks/useSheet";
import "../styles/shared/SettingsSheet.css";
import "../styles/shared/WinePlan.css";

/**
 * La hoja de una receta. Vivía sólo adentro de `WinePlan` (la ficha del
 * vino); se separó porque el Sommelier también necesita mostrar una receta
 * —"dame algo para acompañar este Malbec" es justo el tipo de pregunta que
 * un sommelier de verdad contesta con un plato, no con tres palabras— y las
 * dos pantallas tienen que mostrar la MISMA receta con el MISMO diseño. Que
 * un vino se vea distinto según desde dónde se abrió es lo que esta app
 * viene evitando en todas las demás tarjetas (ver el comentario grande de
 * SuggestionsPage.jsx sobre por qué las tarjetas de vino son las mismas en
 * Mi Bodega, Descubrí y acá); una receta no tenía por qué ser la excepción.
 *
 * `wine`/`info` son opcionales: `ConceptTerm` ya sabe leerse sin ellos ("sin
 * él, se lee igual, sólo que general" — ver ese componente). El Sommelier no
 * siempre tiene la ficha de IA (`info`) de un vino que el usuario ni cargó
 * todavía, así que no puede exigirla.
 */

const buscarEnGoogle = (plato) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${plato} receta`)}`;

// "No es crítico" (pedido explícito), así que va con el mismo criterio que ya
// usa el link de arriba: una búsqueda, no una API de YouTube que hay que
// mantener, pagar y que puede devolver cualquier cosa sin curar.
const buscarEnYoutube = (plato) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${plato} receta`)}`;

export default function WineRecipeSheet({ receta, wine, info, onClose }) {
  const panelRef = useSheet(onClose, { enabled: Boolean(receta) });

  if (!receta) return null;

  return (
    <Portal>
      <div className="settings-sheet" onClick={onClose} role="presentation">
        {/* Mismo vocabulario de "hoja de lectura" que ConceptSheet: el
            medallón repite el ícono del botón que la abrió, así que la
            receta se siente una continuación de ese toque y no un
            formulario nuevo. */}
        <div
          ref={panelRef}
          tabIndex={-1}
          className="settings-sheet__panel settings-sheet__panel--feature wine-recipe-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`Receta: ${receta.dish}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="settings-sheet__head settings-sheet__head--feature">
            <span className="settings-sheet__icon" aria-hidden="true">
              <Icon name="utensils" size={17} />
            </span>
            <div className="settings-sheet__heading">
              <span className="settings-sheet__eyebrow">Para acompañarla</span>
              <h2>{receta.dish}</h2>
            </div>
            <button
              type="button"
              className="settings-sheet__close"
              onClick={onClose}
              aria-label="Cerrar la receta"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="settings-sheet__body wine-recipe">
            {/* El maridaje se explica justo donde acaba de aplicarse: abajo
                de la frase que dice por qué ESTE plato va con ESTE vino. En
                abstracto, "maridaje" no le interesa a nadie. */}
            {receta.why && (
              <p className="wine-recipe__why">
                {receta.why}{" "}
                <ConceptTerm id="maridaje" ctx={{ wine, info }} className="wine-recipe__why-term">
                  ¿cómo se marida?
                </ConceptTerm>
              </p>
            )}

            {(receta.time || receta.servings) && (
              <p className="wine-recipe__meta">
                {receta.time && <span>{receta.time}</span>}
                {receta.servings && (
                  <span>
                    <Icon name="users" size={12} /> {receta.servings}
                  </span>
                )}
              </p>
            )}

            {/* "Ingredientes" y "Preparación", como cualquier receta de
                verdad. El tono gourmet va en cómo está escrita la receta, no
                en rótulos que haya que descifrar. */}
            <h3 className="wine-recipe__label">Ingredientes</h3>
            <ul className="wine-recipe__ingredients">
              {receta.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>

            <h3 className="wine-recipe__label">Preparación</h3>
            <ol className="wine-recipe__steps">
              {receta.steps.map((paso, i) => (
                <li key={i}>{paso}</li>
              ))}
            </ol>

            <div className="wine-recipe__links">
              <a
                className="wine-recipe__web"
                href={buscarEnGoogle(receta.dish)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver otras versiones de este plato <Icon name="arrow-right" size={15} />
              </a>
              {/* Un video ayuda con lo que el texto no puede mostrar —el
                  punto exacto de un sellado, cómo se ve una reducción lista—,
                  que es justo el tipo de cosa que un sommelier de carne y
                  hueso te señalaría con el dedo si estuviera en la cocina
                  con vos. */}
              <a
                className="wine-recipe__web"
                href={buscarEnYoutube(receta.dish)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="play" size={13} /> Ver un video de la receta{" "}
                <Icon name="arrow-right" size={15} />
              </a>
            </div>

            <p className="wine-recipe__note">
              Pensada para esta botella. Ajustá las cantidades a tu gusto y los
              tiempos a tu horno.
            </p>

            {/* La salida abajo, además de la × de arriba. Una receta se lee
                scrolleando hasta el final, y ahí el cierre queda tres
                pantallas atrás: pedirle a alguien que suba para poder salir
                es hacerle deshacer todo el camino que acaba de recorrer. */}
            <button type="button" className="wine-recipe__done" onClick={onClose}>
              Listo, cerrar
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
