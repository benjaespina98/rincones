import { WINE_TYPE_LABELS } from "../data/wineReference";
import "./TypeSplit.css";

/**
 * Distribución de la colección por tipo de vino, en una sola barra apilada.
 *
 * Antes era una tarjeta con una fila por tipo: cinco renglones para decir algo
 * que es, en esencia, una proporción. Una barra la muestra entera de un vistazo
 * y ocupa la altura de un renglón.
 */

// El color del vino, no un color de marca: se reconoce sin leer la etiqueta.
const TYPE_COLORS = {
  red: "#7a1024",
  white: "#e8d99a",
  "rosé": "#e79ab0",
  sparkling: "#f2d675",
  fortified: "#9a5a2a",
  unknown: "#4a4f66",
};

export default function TypeSplit({ counts = [], total = 0 }) {
  const rows = counts.filter((c) => c.count > 0);
  if (rows.length === 0 || total === 0) return null;

  return (
    <div className="type-split">
      <div className="type-split__bar" role="img" aria-label={
        rows.map((r) => `${r.label || WINE_TYPE_LABELS[r.type] || r.type}: ${r.count}`).join(", ")
      }>
        {rows.map((r, i) => (
          <span
            key={r.key || r.type}
            className="type-split__seg"
            style={{
              "--seg": i,
              width: `${(r.count / total) * 100}%`,
              background: TYPE_COLORS[r.type] || TYPE_COLORS.unknown,
            }}
          />
        ))}
      </div>

      {/* El porcentaje, además del conteo. "Tinto 2" al lado de una barra llena
          obliga a hacer la cuenta para saber qué parte de la bodega es; "82%" es
          la lectura que uno quiere de un gráfico de proporciones. Con un solo
          tipo dice 100%, que también es información: es lo único que tomás. */}
      <ul className="type-split__legend">
        {rows.map((r) => (
          <li key={r.key || r.type} className="type-split__item">
            <span
              className="type-split__dot"
              style={{ background: TYPE_COLORS[r.type] || TYPE_COLORS.unknown }}
              aria-hidden="true"
            />
            {r.label || WINE_TYPE_LABELS[r.type] || WINE_TYPE_LABELS.unknown}
            <span className="type-split__n">{r.count}</span>
            <span className="type-split__pct">{Math.round((r.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
