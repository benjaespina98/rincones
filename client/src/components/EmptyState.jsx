import Icon from "./Icon";

/**
 * Estado vacío estándar: ícono + título + explicación + acción opcional.
 *
 * Existe para que todas las pantallas cuenten lo mismo de la misma forma. Antes
 * cada una improvisaba: algunas tenían el patrón completo, otras una frase gris
 * suelta y otras directamente no renderizaban nada (la home dejaba un hueco).
 *
 * ── POR QUÉ AHORA HAY UNA SEGUNDA SALIDA ────────────────────────────────────
 * Con una sola acción, un vacío que no es el que la persona esperaba se vuelve
 * un callejón: "No te queda ninguna botella · Escanear un vino" le ofrece cargar
 * algo a alguien que quizá sólo quería ver lo que ya tomó, y que está a un toque
 * de distancia pero en otra vista. La segunda acción es discreta —un enlace, no
 * un botón— justamente porque es la salida lateral, no la principal.
 */
export default function EmptyState({
  icon = "sparkles",
  title,
  hint,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
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
      {secondaryLabel && onSecondary && (
        <button type="button" className="empty-alt" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}
