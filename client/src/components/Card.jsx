import "./Card.css";

/**
 * La tarjeta.
 *
 * ── LAS VARIANTES SON JERARQUÍA ─────────────────────────────────────────────
 *   hero        lo que manda en su pantalla. Una por pantalla.
 *   normal      un bloque de contenido con nombre propio.
 *   compact     una fila o una tarjeta de rail, donde el aire lo pone la lista.
 *
 * El padding sale de --card-pad-*, que ya existía justamente para esto: la
 * escala --space-* es demasiado gruesa y por eso cada tarjeta terminó eligiendo
 * su propio número, con el resultado absurdo de que el vino del día tenía menos
 * aire que un enlace a una nota.
 *
 * ── `type` ES LO QUE CONECTA LA TARJETA CON EL VINO ─────────────────────────
 * Pasarle el tipo de vino pone `data-wine-type`, y con eso la tarjeta hereda el
 * acento, el gradiente y el halo de ese tipo sin que acá haya una sola línea de
 * color. Ver el hilo en index.css.
 *
 * ── `interactive` NO ES UN ESTILO ───────────────────────────────────────────
 * Cuando la tarjeta entera lleva a algún lado, se renderiza como <button> y no
 * como <div> con onClick: así recibe foco, responde a Enter y se anuncia como
 * lo que es. Un div clickeable es invisible para quien no usa mouse.
 */
export default function Card({
  as,
  variant = "normal",
  type,
  interactive = false,
  glow = false,
  rail = false,
  className = "",
  children,
  ...resto
}) {
  const Tag = as || (interactive ? "button" : "div");
  const props = Tag === "button" ? { type: "button", ...resto } : resto;

  return (
    <Tag
      className={`card card--${variant} ${interactive ? "card--interactive" : ""} ${
        glow ? "card--glow" : ""
      } ${className}`.trim()}
      data-wine-type={type || undefined}
      {...props}
    >
      {rail && <span className="card__rail" aria-hidden="true" />}
      <div className="card__contenido">{children}</div>
    </Tag>
  );
}
