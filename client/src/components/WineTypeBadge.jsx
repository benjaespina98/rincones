import "./WineTypeBadge.css";

/**
 * El tipo de vino, dicho con color Y con palabra.
 *
 * ── POR QUÉ SIEMPRE LLEVA TEXTO ─────────────────────────────────────────────
 * El color por tipo es el hilo visual de la app, pero no puede ser el ÚNICO
 * portador del dato. Dos razones concretas, no teóricas:
 *
 *   · Blanco y espumante son los dos tipos que más se confunden, y sus colores
 *     son los dos más claros de la paleta. El texto es lo que los separa sin
 *     depender de distinguir dos amarillos pálidos.
 *   · Alrededor del 8% de los hombres tiene alguna deficiencia de visión del
 *     color. Tinto y fortificado, o rosado y tinto, se les pueden ver iguales.
 *
 * Así que el color acompaña, no informa solo. Es la misma regla por la que el
 * punto de `.wine-meta__type` va al lado de la palabra y no en lugar de ella.
 */

const ETIQUETAS = {
  red: "Tinto",
  white: "Blanco",
  "rosé": "Rosado",
  rose: "Rosado",
  sparkling: "Espumante",
  fortified: "Fortificado",
  unknown: "Sin tipo",
};

export default function WineTypeBadge({ type = "unknown", size = "md", className = "" }) {
  const etiqueta = ETIQUETAS[type] || ETIQUETAS.unknown;

  return (
    <span
      className={`wtb wtb--${size} ${className}`.trim()}
      data-wine-type={type}
    >
      <span className="wtb__punto" aria-hidden="true" />
      {etiqueta}
    </span>
  );
}
