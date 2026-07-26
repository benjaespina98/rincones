import Icon from "./Icon";

/**
 * Estado de error con reintento.
 *
 * Clave del producto: un fallo de red NO puede verse como un estado vacío. Antes,
 * si fallaba la carga de Guardados el usuario veía "Sin vinos guardados" y podía
 * creer que había perdido sus vinos. Acá decimos qué pasó y ofrecemos reintentar.
 */
export default function ErrorState({
  title = "No pudimos cargar esto",
  hint = "Revisá tu conexión y probá de nuevo.",
  onRetry,
  retrying = false,
  compact = false,
}) {
  return (
    <div className={`error-state ${compact ? "error-state--compact" : ""}`} role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <Icon name="alert-triangle" size={compact ? 22 : 30} />
      </span>
      <p className="error-state__title">{title}</p>
      {hint && <p className="error-state__hint">{hint}</p>}
      {onRetry && (
        <button type="button" className="error-state__retry" onClick={onRetry} disabled={retrying}>
          {retrying ? "Reintentando…" : "Reintentar"}
        </button>
      )}
    </div>
  );
}
