import Icon from "./Icon";

/**
 * El panel que se abre debajo de una fila de Mi Bodega.
 *
 * ── POR QUÉ ES TAN CHICO ────────────────────────────────────────────────────
 * Antes mostraba una ficha técnica en grilla (uva, cosecha, región, dónde está, precio), un renglón
 * de estado y hasta cinco botones con texto en dos filas: más alto que la propia fila y con todo
 * compitiendo por la atención. Ahora son DOS cosas, como en las apps de listas que se despliegan
 * (Mail, Recordatorios, Archivos):
 *
 *   · una línea de texto apagado con lo que sirve para reconocer la botella ("Malbec · 2019 ·
 *     Valle de Uco · Cava 1"), y
 *   · una sola fila de acciones: la principal con texto y las demás sólo con ícono (con su nombre
 *     para el lector de pantalla y el tooltip): favorito, eliminar y, en Probados, volver a "sin probar".
 *
 * El stock NO se toca acá: vive en el stepper de la fila ("−" es "tomé una botella", "+" suma una). Antes el
 * panel repetía lo mismo con "Abrí una botella" y otro "+", y había tres puertas para lo mismo.
 */
export default function WineRowPanel({
  wine,
  conToggleProbado = false,
  isPending,
  nuncaFueTuyo,
  enCava,
  onToggleTasted,
  onToggleFavorite,
  onEliminar,
}) {
  const datos = [
    wine.varietal,
    wine.vintage,
    wine.region,
    wine.cellar?.location,
    wine.purchase?.price > 0 ? `$${Number(wine.purchase.price).toLocaleString("es-AR")}` : "",
  ].filter(Boolean);
  const linea = [nuncaFueTuyo && "Lo tomaste afuera", enCava && `En tu cava hace ${enCava}`, ...datos]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="wine-row__expand wine-row__expand--compacto">
      {linea && <p className="wine-row__resumen">{linea}</p>}

      <div className="wine-row__acciones wine-row__acciones--compacta">
        {/* En "Probados" el chip de la cabecera se esconde (una columna entera repitiendo "Probado" no
            informa), así que acá hace falta esta salida, o desmarcar un vino probado por error no
            tendría cómo deshacerse. Nombra la acción, no el estado. */}
        {conToggleProbado && (
          <button
            type="button"
            className="wine-row__icon-btn wine-row__icon-btn--solo"
            onClick={() => onToggleTasted(wine)}
            disabled={isPending}
            aria-label={wine.tasted ? "Marcar como sin probar" : "Marcar como ya probado"}
            title={wine.tasted ? "Marcar como sin probar" : "Marcar como ya probado"}
          >
            <Icon name={wine.tasted ? "refresh" : "check"} size={18} />
          </button>
        )}

        <button
          type="button"
          className={`wine-row__icon-btn wine-row__icon-btn--solo ${wine.favorite ? "is-fav" : ""}`}
          onClick={() => onToggleFavorite(wine)}
          disabled={isPending}
          aria-pressed={!!wine.favorite}
          aria-label="Favorito"
          title="Favorito"
        >
          <Icon name="heart" filled={wine.favorite} size={18} />
        </button>

        <button
          type="button"
          className="wine-row__icon-btn wine-row__icon-btn--solo wine-row__icon-btn--danger"
          onClick={() => onEliminar(wine._id)}
          disabled={isPending}
          aria-label="Eliminar"
          title="Eliminar"
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    </div>
  );
}
