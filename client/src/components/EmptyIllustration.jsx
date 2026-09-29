import "./EmptyIllustration.css";

/**
 * Las ilustraciones de los estados vacíos.
 *
 * ── POR QUÉ NO ALCANZA UN ÍCONO ─────────────────────────────────────────────
 * `EmptyState` usaba el mismo ícono de 34 px para todo, así que "todavía no
 * cargaste ningún vino", "no te queda stock" y "no encontramos nada" se veían
 * idénticos. Un vacío es el momento en que la app tiene MENOS para mostrar y
 * más para explicar: es justo donde el dibujo tiene que cargar significado,
 * porque el texto de al lado es una línea.
 *
 * ── POR QUÉ SON DE TRAZO Y NO SÓLIDAS ───────────────────────────────────────
 * Una ilustración rellena compite con el contenido real que va a aparecer
 * cuando el vacío deje de estarlo — y el vacío es un estado de paso, no el
 * destino. Estas son de línea fina, en el color más tenue del texto, con UN
 * solo acento. Se leen como una anotación de la interfaz.
 *
 * Todas pintan con `currentColor`, así que heredan el color de donde se las
 * ponga; el acento sale de una clase, no de un atributo, para que pueda
 * cambiarlo el contexto (ver `data-wine-type` en la hoja).
 *
 * ── UNA POR SITUACIÓN, NO POR PANTALLA ──────────────────────────────────────
 * Lo que elige el dibujo es lo que PASÓ, no dónde está parado el usuario: la
 * misma cava vacía sirve en Mi Bodega y en el perfil. Por eso los nombres son
 * situaciones ("cava", "copa", "busqueda") y no rutas.
 *
 * ── ACCESIBILIDAD ───────────────────────────────────────────────────────────
 * Son decorativas: `aria-hidden` y `focusable="false"` (que hace falta aparte,
 * porque IE/Edge viejos meten los SVG en el orden de tabulación). Lo que se
 * anuncia es el texto del `EmptyState`, que dice lo mismo con palabras.
 */

const TRAZO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Cava vacía: no hay ningún vino cargado todavía. */
const Cava = () => (
  <>
    <path d="M14 22h92v76a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V22Z" {...TRAZO} />
    <path d="M14 48h92M14 78h92M46 22v84M78 22v84" {...TRAZO} opacity="0.45" />
    {/* Una botella sola, acostada en su hueco. La cava no está rota: está
        esperando. Es lo que separa "vacío" de "vacío y triste". */}
    <g className="empty-ilu__acento">
      <path d="M20 38h16a4 4 0 0 0 4-4v-2a4 4 0 0 0-4-4H20" {...TRAZO} />
      <path d="M20 28v10" {...TRAZO} />
    </g>
  </>
);

/** Copa vacía: tenés vinos cargados, pero no te queda stock. */
const Copa = () => (
  <>
    <path d="M38 18h44l-4 26a18 18 0 0 1-36 0l-4-26Z" {...TRAZO} />
    <path d="M60 62v32M44 100h32" {...TRAZO} />
    {/* El resto que queda en el fondo: se tomó, no es que nunca hubo. */}
    <path className="empty-ilu__acento" d="M50 38h20" {...TRAZO} strokeWidth="3" />
  </>
);

/** Corazón: no marcaste favoritos ni anotaste nada para conseguir. */
const Favoritos = () => (
  <>
    <path
      d="M60 98S22 76 22 50a18 18 0 0 1 32-11l6 8 6-8a18 18 0 0 1 32 11c0 26-38 48-38 48Z"
      {...TRAZO}
    />
    {/* Un "más" adentro: el vacío es una invitación, no un aviso. */}
    <path className="empty-ilu__acento" d="M60 46v22M49 57h22" {...TRAZO} />
  </>
);

/** Lupa sobre una etiqueta: la búsqueda no encontró nada. */
const Busqueda = () => (
  <>
    <rect x="20" y="22" width="52" height="64" rx="6" {...TRAZO} />
    <path d="M32 40h28M32 52h20M32 64h24" {...TRAZO} opacity="0.5" />
    <circle cx="76" cy="72" r="19" {...TRAZO} className="empty-ilu__acento" />
    <path d="M90 86l12 12" {...TRAZO} className="empty-ilu__acento" />
  </>
);

/** Cuaderno con la marca de una copa: el diario no tiene momentos. */
const Diario = () => (
  <>
    <path d="M24 18h56a8 8 0 0 1 8 8v72a8 8 0 0 1-8 8H24Z" {...TRAZO} />
    <path d="M24 18v88" {...TRAZO} />
    <path d="M38 40h32M38 56h32M38 72h20" {...TRAZO} opacity="0.5" />
    {/* El cerco que deja la copa apoyada sobre el papel. Es el detalle que
        convierte un cuaderno en un diario de vinos. */}
    <circle cx="76" cy="84" r="14" {...TRAZO} className="empty-ilu__acento" />
  </>
);

/** Globo de diálogo con una estrella: todavía no hay reseñas. */
const Resenas = () => (
  <>
    <path
      d="M18 30a8 8 0 0 1 8-8h68a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H50L32 94V78h-6a8 8 0 0 1-8-8Z"
      {...TRAZO}
    />
    <path
      className="empty-ilu__acento"
      d="m60 34 5.2 11 11.8 1.6-8.6 8.2 2.2 11.9L60 61l-10.6 5.7 2.2-11.9-8.6-8.2L54.8 45 60 34Z"
      {...TRAZO}
    />
  </>
);

const ILUSTRACIONES = {
  cava: Cava,
  copa: Copa,
  favoritos: Favoritos,
  busqueda: Busqueda,
  diario: Diario,
  resenas: Resenas,
};

export default function EmptyIllustration({ name = "cava", size = 116, className = "" }) {
  const Dibujo = ILUSTRACIONES[name] || ILUSTRACIONES.cava;

  return (
    <svg
      className={`empty-ilu ${className}`.trim()}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <Dibujo />
    </svg>
  );
}

/** Para el styleguide: la lista de situaciones que hay dibujadas. */
export const NOMBRES_ILUSTRACION = Object.keys(ILUSTRACIONES);
