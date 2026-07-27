/**
 * Monograma de Rincones: la R es una copa.
 *
 * La panza de la R hace de cáliz (con el vino adentro) y el asta baja hasta
 * abrirse en la base de la copa. Un solo trazo sostiene las dos lecturas, y
 * sigue funcionando a 24px — que es donde vive un logo de app.
 *
 * Único lugar donde se dibuja la marca: header, splash y favicon salen de acá.
 */
export default function Logo({ size = 40, animated = false, className = "" }) {
  return (
    <svg
      className={`logo ${animated ? "logo--animated" : ""} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Rincones"
    >
      <defs>
        <linearGradient id="rincones-wine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b4223d" />
          <stop offset="1" stopColor="#6d0f20" />
        </linearGradient>
      </defs>

      {/* Vino dentro del cáliz */}
      <path
        className="logo__wine"
        d="M32 22 h23 a17 17 0 0 1 0 34 h-23 Z"
        fill="url(#rincones-wine)"
      />

      <g
        className="logo__stroke"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Cáliz (panza de la R) */}
        <path d="M32 22 h23 a17 17 0 0 1 0 34 h-23" />
        {/* Asta de la R = tallo de la copa */}
        <path d="M32 22 V84" />
        {/* Base de la copa: dos diagonales, no una línea recta, para que no se
            lea como subrayado del monograma. */}
        <path d="M21 84 q11 -6 22 0" />
        {/* Pierna de la R */}
        <path d="M52 56 L70 84" />
      </g>
    </svg>
  );
}
