import "../styles/components/WineArtwork.css";

// Color del "líquido" según el tipo de vino. Reemplaza al 🍷 genérico por un
// placeholder que se ve intencional cuando el vino no tiene foto.
const TYPE_COLORS = {
  red: ["#7d1f38", "#b23a55"],
  white: ["#c9b24a", "#e8d67a"],
  "rosé": ["#c65a7a", "#e58aa4"],
  sparkling: ["#c2a63a", "#e4cf6a"],
  fortified: ["#5a2a12", "#8a4a24"],
  unknown: ["#5a4a86", "#8a6fc9"],
};

/**
 * Placeholder de botella para vinos sin foto. `type` pinta el vino;
 * `size` controla el alto en px del gráfico.
 */
export default function WineArtwork({ type = "unknown", size = 96, className = "" }) {
  const [from, to] = TYPE_COLORS[type] || TYPE_COLORS.unknown;
  const gid = `wa-${type}`;

  return (
    <div className={`wine-artwork ${className}`} aria-hidden="true">
      <svg viewBox="0 0 60 120" width={size * 0.5} height={size} role="img">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={to} />
            <stop offset="1" stopColor={from} />
          </linearGradient>
        </defs>
        {/* Botella */}
        <path
          d="M24 6h12v20c0 3 8 8 8 20v42a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V46c0-12 8-17 8-20V6Z"
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.5"
        />
        {/* Líquido */}
        <path
          d="M18 60c0-8 5-12 6-14h12c1 2 6 6 6 14v28a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V60Z"
          fill={`url(#${gid})`}
        />
        {/* Etiqueta */}
        <rect x="20" y="64" width="20" height="18" rx="2" fill="rgba(255,255,255,0.9)" />
        <rect x="23" y="69" width="14" height="2.4" rx="1.2" fill={from} />
        <rect x="23" y="74" width="10" height="2" rx="1" fill="rgba(0,0,0,0.28)" />
        {/* Brillo */}
        <path d="M27 12v70" stroke="rgba(255,255,255,0.14)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
