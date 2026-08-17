import "./TopRanking.css";

/**
 * Top 3 de uvas o regiones, con la barra proporcional al primero.
 *
 * El diseño anterior era una tarjeta entera por lista, con cinco filas de
 * número + nombre + cuenta: media pantalla para decir "tomás sobre todo Malbec".
 * Acá el largo de la barra ya cuenta la historia, así que con tres alcanza y
 * las dos listas entran una al lado de la otra.
 */
/**
 * El nombre corto de una región: lo que va antes de la coma.
 *
 * "Luján de Cuyo, Mendoza" no entra en media columna de un teléfono y se cortaba
 * como "Luján de Cuyo, Mend…" — el peor de los dos mundos: ocupa el ancho de la
 * provincia y no llega a decirla. Y en esta lista la provincia casi siempre es
 * la misma en las tres filas (Mendoza, Mendoza, Mendoza): lo que distingue a una
 * región de otra es justamente lo de adelante.
 *
 * El nombre completo no se pierde, queda en el `title`. Y una región sin coma
 * ("Mendoza", "Patagonia") se muestra tal cual.
 */
const nombreCorto = (valor) => String(valor || "").split(",")[0].trim() || valor;

export default function TopRanking({ label, items = [], nameKey }) {
  const rows = items.filter((i) => i[nameKey]).slice(0, 3);
  if (rows.length === 0) return null;

  const max = rows[0].count || 1;

  return (
    <div className="rank">
      <span className="rank__label">{label}</span>
      {/* La barra es la fila entera y el nombre va ENCIMA, no al lado.
          Antes el nombre, una barrita de 40px y el número eran tres columnas:
          la barra quedaba flotando en el medio del renglón, demasiado corta
          para comparar nada y con la mitad del ancho vacío a los costados. */}
      <ul className="rank__list">
        {rows.map((item) => (
          <li key={item[nameKey]} className="rank__row">
            <span
              className="rank__fill"
              style={{ width: `${Math.max((item.count / max) * 100, 12)}%` }}
              aria-hidden="true"
            />
            <span className="rank__name" title={item[nameKey]}>{nombreCorto(item[nameKey])}</span>
            <span className="rank__n">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
