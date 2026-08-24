import { useId } from "react";

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
  // El gradiente necesita un id ÚNICO por instancia. Con uno fijo, dos logos en
  // la misma pantalla (la barra inferior y el de la home, por ejemplo) declaran
  // el mismo id y todos los `url(#…)` resuelven contra el primero del
  // documento; si ese vive en un contenedor oculto —la barra lo está en
  // mobile—, el vino de la copa no se pinta y la R queda vacía.
  //
  // Los ":" de useId no son válidos dentro de una referencia url(#…).
  const gradId = `rincones-wine-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className={`logo ${animated ? "logo--animated" : ""} ${className}`}
      width={size}
      height={size}
      /**
       * ── EL viewBox NO ARRANCA EN 0 0, Y ES A PROPÓSITO ────────────────────
       *
       * El dibujo nunca estuvo centrado dentro de su caja. Medido en el
       * navegador (`getBBox()` más los 2.5 que sobresale el trazo de 5 con
       * punta redonda), ocupa x[18.5, 74.5] e y[19.5, 86.5]: su centro real es
       * (46.5, 53), no (50, 50). O sea que colgaba 3.5 a la derecha y 3 arriba.
       *
       * Se notaba poco mientras el logo era un ícono chico con aire alrededor,
       * pero saltaba a la vista al recortarlo en círculo —un avatar— o al
       * ponerlo dentro de una caja de color: la copa quedaba pegada a un lado.
       *
       * Correrle el origen al viewBox lo centra SIN tocar un solo trazo y sin
       * cambiar la escala: la caja sigue midiendo 100×100, sólo se mueve.
       * Cualquier otra forma —envolver en un <g transform>, reescribir los
       * paths— hace lo mismo con más piezas para mantener.
       */
      viewBox="-3.5 3 100 100"
      role="img"
      aria-label="Rincones"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b4223d" />
          <stop offset="1" stopColor="#6d0f20" />
        </linearGradient>
      </defs>

      {/* Vino dentro del cáliz */}
      <path
        className="logo__wine"
        d="M32 22 h23 a17 17 0 0 1 0 34 h-23 Z"
        fill={`url(#${gradId})`}
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
