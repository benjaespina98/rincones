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
 *
 * ── POR QUÉ EL CHIP CON ✕ NO ES UN BOTÓN ────────────────────────────────────
 * Lo era, con la ✕ adentro, y eso es HTML inválido: un botón no puede contener
 * otro botón. No es una formalidad. El navegador no anida el de adentro — lo
 * saca del de afuera al construir el DOM—, así que la pastilla quedaba partida
 * en dos elementos hermanos y la ✕ terminaba fuera de la cápsula que la dibuja.
 * React lo venía avisando en consola como error de hidratación.
 *
 * Con `onRemove`, entonces, la cápsula pasa a ser un <span> que contiene los
 * controles: la ✕ siempre, y el cuerpo como botón sólo si además hay un
 * `onClick`. Sacar un filtro y cambiarlo son dos acciones distintas y por eso
 * son dos controles; meterlas en uno obliga a adivinar cuál se disparó.
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
  const clases = `chip ${active ? "is-active" : ""} ${className}`.trim();
  const etiquetaQuitar =
    removeLabel || `Quitar ${typeof children === "string" ? children : "filtro"}`;

  if (onRemove) {
    const { onClick, ...restoSpan } = resto;
    return (
      <span className={`${clases} chip--quitable`} data-wine-type={type || undefined} {...restoSpan}>
        {onClick ? (
          <button type="button" className="chip__cuerpo" aria-pressed={active} onClick={onClick}>
            {children}
          </button>
        ) : (
          <span className="chip__texto">{children}</span>
        )}
        <button type="button" className="chip__quitar" aria-label={etiquetaQuitar} onClick={onRemove}>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </span>
    );
  }

  const Tag = estatica ? "span" : "button";
  const props = estatica ? {} : { type: "button", "aria-pressed": active, ...resto };

  return (
    <Tag className={clases} data-wine-type={type || undefined} {...props}>
      <span className="chip__texto">{children}</span>
    </Tag>
  );
}
