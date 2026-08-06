import ConceptTerm from "./ConceptTerm";
import "./WineStructure.css";

/**
 * Estructura del vino en barras: cuerpo, acidez, taninos y dulzor (1-5).
 *
 * Es el patrón que usa Vivino y es lo que a la ficha le faltaba: un ancla
 * concreta y comparable entre botellas. La prosa dice "cuerpo medio-alto con
 * taninos firmes"; esto deja ver de un vistazo si un vino es más o menos
 * corpulento que otro.
 *
 * Los valores los produce el mismo llamado a Gemini que ya se hacía para la
 * descripción (y que ya está cacheado), así que no cuesta ni una petición extra.
 */

/**
 * Cada eje dice su palabra según dónde cae, incluido el medio. Antes el corte era
 * `valor >= 3 ? alto : bajo`: un cuerpo de 3 sobre 5 se anunciaba "Corpulento" y
 * la lista de abajo, en la misma pantalla, decía "Cuerpo medio". Dos etiquetas
 * distintas para el mismo número.
 */
// `concept` cuelga la explicación del rótulo. El dulzor no tiene: se entiende
// solo y no hay nada que aclarar que la palabra ("Seco") no diga ya.
const SCALES = [
  { key: "body", label: "Cuerpo", concept: "cuerpo", words: ["Liviano", "Liviano", "Medio", "Corpulento", "Corpulento"] },
  { key: "acidity", label: "Acidez", concept: "acidez", words: ["Suave", "Suave", "Media", "Fresca", "Fresca"] },
  { key: "tannin", label: "Taninos", concept: "taninos", words: ["Sedosos", "Sedosos", "Medios", "Firmes", "Firmes"] },
  { key: "sweetness", label: "Dulzor", words: ["Seco", "Seco", "Semiseco", "Dulce", "Dulce"] },
];

export default function WineStructure({ structure, wine }) {
  if (!structure) return null;

  // Los blancos y espumantes vienen con taninos en 1: mostrar una barra vacía
  // es ruido, así que ese eje se omite.
  const rows = SCALES.filter(({ key }) => {
    const v = structure[key];
    return Number.isFinite(v) && !(key === "tannin" && v <= 1);
  });
  if (rows.length === 0) return null;

  return (
    <div className="wine-structure">
      <span className="wine-structure__title">Perfil de sabor</span>
      <div className="wine-structure__rows">
        {rows.map(({ key, label, words, concept }) => {
          const value = structure[key];
          const palabra = words[Math.min(Math.max(value, 1), 5) - 1];
          return (
            <div className="wine-structure__row" key={key}>
              {/* El rótulo abre la explicación del concepto, con el número de
                  ESTE vino adentro. Es donde de verdad se hace la pregunta:
                  nadie se pregunta qué son los taninos en abstracto, se lo
                  pregunta mirando una barra que dice 4 de 5. */}
              <span className="wine-structure__label">
                {concept ? (
                  <ConceptTerm id={concept} ctx={{ wine, info: { structure } }}>
                    {label}
                  </ConceptTerm>
                ) : (
                  label
                )}
              </span>
              <div
                className="wine-structure__track"
                role="meter"
                aria-valuenow={value}
                aria-valuemin={1}
                aria-valuemax={5}
                aria-label={`${label}: ${palabra}, ${value} de 5`}
              >
                {[1, 2, 3, 4, 5].map((step) => (
                  <span
                    key={step}
                    className={`wine-structure__step ${step <= value ? "is-on" : ""}`}
                  />
                ))}
              </div>
              <span className="wine-structure__end">{palabra}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
