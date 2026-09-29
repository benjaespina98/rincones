import "./Chip.css";

/**
 * La pastilla: un filtro, una opción, una etiqueta que se puede sacar.
 *
 * ── UNA CÁPSULA PROMETE QUE SE TOCA ─────────────────────────────────────────
 * Es la regla que index.css ya fijó cuando sacó las pastillas de los datos del
 * vino: la forma de cápsula es la forma de algo que se toca. Un dato que sólo
 * se lee no va acá — va como texto, con `WineMeta`.
 *
 * Por eso este componente siempre es un control: o un botón, o algo con
 * `onRemove`. Si hace falta mostrar algo que no se toca, la variante `estatica`
 * lo renderiza como <span> y sin cursor, pero es la excepción y tiene que
 * justificarse.
 */
export default function Chip({
  children,
  active = false,
  onRemove,
  removeLabel,
  estatica = false,
  type,
  className = "",
  ...resto
}) {
  const Tag = estatica ? "span" : "button";
  const props = estatica ? {} : { type: "button", "aria-pressed": active, ...resto };

  return (
    <Tag
      className={`chip ${active ? "is-active" : ""} ${className}`.trim()}
      data-wine-type={type || undefined}
      {...props}
    >
      <span className="chip__texto">{children}</span>
      {onRemove && (
        /* Va como botón aparte y no como parte del chip: sacar un filtro y
           cambiarlo son dos acciones distintas, y meterlas en el mismo control
           obliga a adivinar cuál se disparó. */
        <button
          type="button"
          className="chip__quitar"
          aria-label={removeLabel || `Quitar ${typeof children === "string" ? children : "filtro"}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </Tag>
  );
}
