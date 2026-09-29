import "./WineArtwork.css";

/**
 * La botella que se dibuja cuando no hay foto.
 *
 * ── POR QUÉ IMPORTA MÁS DE LO QUE PARECE ────────────────────────────────────
 * No es un relleno para un caso raro: el pool de fotos comunitario todavía no
 * cubre el catálogo, así que en Descubrí la MAYORÍA de las tarjetas llega sin
 * imagen. Esto es lo que se ve. Una sola silueta gris para todo hacía que ocho
 * recomendaciones distintas se vieran como ocho veces la misma.
 *
 * ── UNA FORMA POR TIPO, NO UN COLOR POR TIPO ────────────────────────────────
 * Antes el tipo sólo cambiaba el color del líquido. Pero la forma de la botella
 * ES el dato: cualquiera que haya mirado una góndola distingue un borgoña de
 * hombros caídos de un bordeaux de hombros marcados, y un champagne por lo
 * gruesa y el bozal. Dibujar la forma real hace que el tipo se reconozca aun
 * en miniatura, y de paso que la pantalla no se vea repetida.
 *
 *   red         bordeaux, hombro marcado
 *   white       borgoña, hombro caído y cuerpo más esbelto
 *   rosé        borgoña más angosta
 *   sparkling   champagne: pared gruesa, base ancha, bozal y burbujas
 *   fortified   oporto, cuello con bulbo
 *
 * ── DE DÓNDE SALE EL COLOR ──────────────────────────────────────────────────
 * De los tokens, vía `data-wine-type`. Antes esta tabla tenía sus propios
 * hexadecimales, y por eso el espumante era dorado acá y celeste en las listas:
 * dos fuentes para el mismo dato. Ahora hay una.
 */

/** Silueta y líquido por tipo. El viewBox es siempre 60×120. */
const FORMAS = {
  // Hombro marcado, casi recto: el perfil clásico de un tinto de Burdeos.
  red: {
    cuerpo: "M24 6h12v18c0 2 9 5 9 18v66a6 6 0 0 1-6 6H21a6 6 0 0 1-6-6V42c0-13 9-16 9-18V6Z",
    liquido: "M17 56c0-9 6-12 7-14h12c1 2 7 5 7 14v32a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V56Z",
  },
  // Hombro caído y cuerpo más ancho abajo: borgoña.
  white: {
    cuerpo: "M25 6h10v16c0 4 10 10 10 26v60a6 6 0 0 1-6 6H21a6 6 0 0 1-6-6V48c0-16 10-22 10-26V6Z",
    liquido: "M17 62c0-12 7-16 8-18h10c1 2 8 6 8 18v26a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V62Z",
  },
  "rosé": {
    cuerpo: "M26 6h8v16c0 4 9 10 9 26v60a6 6 0 0 1-6 6H23a6 6 0 0 1-6-6V48c0-16 9-22 9-26V6Z",
    liquido: "M19 64c0-11 6-15 7-17h8c1 2 7 6 7 17v24a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V64Z",
  },
  // Champagne: cuello grueso, hombro muy caído, base ancha.
  sparkling: {
    cuerpo: "M23 6h14v14c0 5 10 12 10 30v56a6 6 0 0 1-6 6H19a6 6 0 0 1-6-6V50c0-18 10-25 10-30V6Z",
    liquido: "M15 66c0-14 8-19 9-21h12c1 2 9 7 9 21v22a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V66Z",
  },
  // Oporto: bulbo en el cuello, que es su marca registrada.
  fortified: {
    cuerpo: "M25 6h10v10c3 1 4 4 4 7s-1 5-4 6v2c0 2 8 5 8 18v65a6 6 0 0 1-6 6H23a6 6 0 0 1-6-6V49c0-13 8-16 8-18v-2c-3-1-4-3-4-6s1-6 4-7V6Z",
    liquido: "M19 60c0-9 6-12 7-14h8c1 2 7 5 7 14v28a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V60Z",
  },
  unknown: {
    cuerpo: "M24 6h12v20c0 3 8 8 8 20v42a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V46c0-12 8-17 8-20V6Z",
    liquido: "M18 60c0-8 5-12 6-14h12c1 2 6 6 6 14v28a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V60Z",
  },
};

/**
 * Placeholder de botella para vinos sin foto. `type` elige forma y color;
 * `size` controla el alto en px del gráfico.
 */
export default function WineArtwork({ type = "unknown", size = 96, className = "" }) {
  const forma = FORMAS[type] || FORMAS.unknown;
  const esEspumante = type === "sparkling";

  return (
    <div
      className={`wine-artwork ${className}`.trim()}
      data-wine-type={type}
      aria-hidden="true"
    >
      <svg viewBox="0 0 60 120" width={size * 0.5} height={size} role="presentation">
        <path className="wine-artwork__vidrio" d={forma.cuerpo} />
        <path className="wine-artwork__liquido" d={forma.liquido} />

        {/* El bozal del champagne: dos trazos y ya se reconoce. */}
        {esEspumante && (
          <g className="wine-artwork__bozal">
            <rect x="22" y="16" width="16" height="7" rx="2" />
            <path d="M23 26h14" />
          </g>
        )}

        {/* Burbujas, sólo donde corresponde. Suben en bucle; con
            prefers-reduced-motion se quedan quietas (ver la hoja). */}
        {esEspumante && (
          <g className="wine-artwork__burbujas">
            <circle cx="24" cy="80" r="1.6" style={{ animationDelay: "0s" }} />
            <circle cx="30" cy="86" r="1.2" style={{ animationDelay: "0.9s" }} />
            <circle cx="36" cy="82" r="1.4" style={{ animationDelay: "1.7s" }} />
          </g>
        )}

        {/* La etiqueta: es lo que hace que se lea como una botella y no como un
            frasco. Va en blanco translúcido, no del color del tipo, porque una
            etiqueta real es papel. */}
        <rect className="wine-artwork__etiqueta" x="20" y="66" width="20" height="18" rx="2" />
        <rect className="wine-artwork__renglon" x="23" y="71" width="14" height="2.2" rx="1.1" />
        <rect className="wine-artwork__renglon" x="24" y="76" width="12" height="1.8" rx="0.9" />
      </svg>
    </div>
  );
}
