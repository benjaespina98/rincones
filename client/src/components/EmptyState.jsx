import Icon from "./Icon";

/**
 * Estado vacío estándar: ícono + título + explicación + acción opcional.
 *
 * Existe para que todas las pantallas cuenten lo mismo de la misma forma. Antes
 * cada una improvisaba: algunas tenían el patrón completo, otras una frase gris
 * suelta y otras directamente no renderizaban nada (la home dejaba un hueco).
 */
export default function EmptyState({
  icon = "sparkles",
  title,
  hint,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}>
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 26 : 34} />
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-subtitle">{hint}</p>}
      {actionLabel && onAction && (
        <button type="button" className="empty-cta" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
