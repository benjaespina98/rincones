import Icon from "./Icon";
import Button from "./Button";

/**
 * Estado de error con reintento.
 *
 * Clave del producto: un fallo de red NO puede verse como un estado vacío. Antes,
 * si fallaba la carga de Guardados el usuario veía "Sin vinos guardados" y podía
 * creer que había perdido sus vinos. Acá decimos qué pasó y ofrecemos reintentar.
 */
export default function ErrorState({
  title = "No se pudo cargar esto",
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
        /* Un Button y no un <button> con su propia clase: es la MISMA acción en
           veinte pantallas, y tenerla dibujada aparte era lo que hacía que el
           botón de reintentar se viera distinto según dónde fallara la carga.
           El spinner reemplaza al cambio de texto: dice que está pasando algo
           sin que el botón cambie de ancho a mitad de la acción. */
        <Button
          variant="secondary"
          size={compact ? "sm" : "md"}
          onClick={onRetry}
          disabled={retrying}
          loading={retrying}
          className="error-state__retry"
        >
          {retrying ? "Reintentando" : "Reintentar"}
        </Button>
      )}
    </div>
  );
}
