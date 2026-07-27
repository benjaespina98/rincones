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

const SCALES = [
  { key: "body", label: "Cuerpo", low: "Liviano", high: "Corpulento" },
  { key: "acidity", label: "Acidez", low: "Suave", high: "Fresca" },
  { key: "tannin", label: "Taninos", low: "Sedosos", high: "Firmes" },
  { key: "sweetness", label: "Dulzor", low: "Seco", high: "Dulce" },
];

export default function WineStructure({ structure }) {
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
        {rows.map(({ key, label, low, high }) => {
          const value = structure[key];
          return (
            <div className="wine-structure__row" key={key}>
              <span className="wine-structure__label">{label}</span>
              <div
                className="wine-structure__track"
                role="meter"
                aria-valuenow={value}
                aria-valuemin={1}
                aria-valuemax={5}
                aria-label={`${label}: ${value} de 5 (${low} a ${high})`}
              >
                {[1, 2, 3, 4, 5].map((step) => (
                  <span
                    key={step}
                    className={`wine-structure__step ${step <= value ? "is-on" : ""}`}
                  />
                ))}
              </div>
              <span className="wine-structure__end">{value >= 3 ? high : low}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
