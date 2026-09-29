import { forwardRef } from "react";
import "./Button.css";

/**
 * El botón, una sola vez.
 *
 * ── QUÉ REEMPLAZA ───────────────────────────────────────────────────────────
 * Había botones primarios declarados en quince hojas, cada una con su propio
 * alto, su propio radio y su propio degradado. Dos botones de la misma pantalla
 * podían verse distintos sin que nadie lo hubiera decidido.
 *
 * ── LAS VARIANTES SON JERARQUÍA, NO DECORACIÓN ──────────────────────────────
 * Cada una dice qué tan importante es la acción, y por eso son pocas:
 *
 *   primary      la acción de la pantalla. Una sola por pantalla.
 *   secondary    una alternativa real a la primaria.
 *   ghost        algo que se puede hacer y no hace falta mirar.
 *   icon         un solo ícono, sin texto. Exige `aria-label`.
 *   destructive  borra algo. Roja para que cueste tocarla de más.
 *
 * `icon` no lleva texto, así que el nombre accesible tiene que venir por
 * `aria-label`: sin él, un lector de pantalla anuncia "botón" y nada más. En
 * desarrollo se avisa por consola cuando falta, porque es el error que no se
 * nota mirando la pantalla.
 */

const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    type = "button",
    loading = false,
    disabled = false,
    iconLeft,
    iconRight,
    className = "",
    children,
    ...resto
  },
  ref
) {
  if (import.meta.env.DEV && variant === "icon" && !resto["aria-label"]) {
    console.warn(
      "Button variant=icon sin aria-label: el lector de pantalla va a anunciar sólo 'botón'."
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      // `aria-disabled` además de `disabled`: un botón deshabilitado de verdad
      // no recibe foco, así que quien navega con teclado nunca se entera de que
      // existe. Mientras carga sigue siendo enfocable y se anuncia ocupado.
      disabled={disabled}
      aria-busy={loading || undefined}
      {...resto}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : (
        iconLeft && <span className="btn__icono">{iconLeft}</span>
      )}
      {children && <span className="btn__texto">{children}</span>}
      {!loading && iconRight && <span className="btn__icono">{iconRight}</span>}
    </button>
  );
});

export default Button;
