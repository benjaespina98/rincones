// Lightweight SVG icon set (Lucide-style, stroke = currentColor).
// Keeps the UI consistent across platforms instead of relying on emoji/unicode.

const PATHS = {
  "arrow-left": <path d="M19 12H5M12 19l-7-7 7-7" />,
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M20 6 9 17l-5-5" />,
  circle: <circle cx="12" cy="12" r="8" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  "log-out": <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  sparkles: (
    <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
  ),
  "map-pin": (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  "arrow-right": <path d="M5 12h14M13 5l7 7-7 7" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3 5.3-2.2Z" />
    </>
  ),
  play: <path d="M7 5v14l11-7-11-7Z" />,
  graduation: (
    <>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
    </>
  ),
  chat: <path d="M4 5h16v11H8l-4 4V5Z" />,
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </>
  ),
  cake: (
    <>
      <path d="M4 20h16M5 20v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
      <path d="M4 15c1.2 0 1.2 1 2.4 1s1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1" />
      <path d="M12 8V6M12 4v.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.6M6 6.5A17 17 0 0 0 2 12s3.6 7 10 7a9.5 9.5 0 0 0 4-.9" />
      <path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  store: (
    <>
      <path d="M3.5 9h17l-1.2-4.2a1.5 1.5 0 0 0-1.4-1.1H6.1a1.5 1.5 0 0 0-1.4 1.1L3.5 9Z" />
      <path d="M5 9v10.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 20.5V14h4v6.5" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v7a2 2 0 0 0 4 0V3" />
      <path d="M8 10v11" />
      <path d="M17.5 3c-1.7 1.2-2.5 3-2.5 5.2 0 1.6.7 2.7 2 3.3V21" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M17.5 20a5.5 5.5 0 0 0-2.2-4.4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.8" cy="6" r="1.1" />
      <circle cx="3.8" cy="12" r="1.1" />
      <circle cx="3.8" cy="18" r="1.1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </>
  ),
  star: <path d="M12 3.3l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.4 9.4l5.8-.8L12 3.3Z" />,
  "alert-triangle": (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </>
  ),
};

// Variantes sólidas. Además de heart/star, acá viven los íconos de la barra de
// navegación y la marca, que antes estaban duplicados dentro de
// BottomTabNavigation como un set de SVG paralelo.
const FILLED = {
  // Corazón simétrico y prolijo (el anterior se veía torcido a tamaño chico).
  heart:
    "M12 21.35 3.6 12.9a5.5 5.5 0 0 1 7.8-7.77l.6.6.6-.6a5.5 5.5 0 0 1 7.8 7.77L12 21.35Z",
  star: "M12 3.3l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.4 9.4l5.8-.8L12 3.3Z",
  // Copa: la usa el Sommelier y la marca de Rincones (favicon).
  "wine-glass":
    "M9 2h6v4l-1.6 5.3a5.2 5.2 0 0 0-.1 1.4V19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-6.3a5.2 5.2 0 0 0-.1-1.4L7 6V2Z",
  // Botella: representa la bodega/colección.
  bottle:
    "M10.4 2h3.2v2.4c0 .5.1 1 .4 1.5l.9 1.6c.4.7.6 1.5.6 2.3V20a2 2 0 0 1-2 2h-2.6a2 2 0 0 1-2-2V9.8c0-.8.2-1.6.6-2.3l.9-1.6c.3-.5.4-1 .4-1.5V2Z",
  sparkle: "m12 3 2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7L12 3Z",
  "user-solid":
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z",
  "plus-solid": "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
};

const HEART_OUTLINE =
  "M12 21.35 3.6 12.9a5.5 5.5 0 0 1 7.8-7.77l.6.6.6-.6a5.5 5.5 0 0 1 7.8 7.77L12 21.35Z";

export default function Icon({ name, filled = false, size = 20, className = "", ...rest }) {
  // Filled variants (heart/star) render a solid shape.
  if (filled && FILLED[name]) {
    return (
      <svg
        className={`icon ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
        {...rest}
      >
        <path d={FILLED[name]} />
      </svg>
    );
  }

  const content = name === "heart" ? <path d={HEART_OUTLINE} /> : PATHS[name];

  // Algunos íconos (copa, botella, destello) existen SÓLO como forma sólida:
  // no tienen versión de contorno porque no tendría sentido dibujarlos así.
  // Sin este fallback, pedirlos sin `filled` devolvía null y NO SE DIBUJABA NADA
  // —el estado vacío del Sommelier mostraba un círculo hueco, y la barra de
  // navegación dependía de que cada llamada se acordara de pasar `filled`.
  if (!content && FILLED[name]) {
    return (
      <svg
        className={`icon ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
        {...rest}
      >
        <path d={FILLED[name]} />
      </svg>
    );
  }

  if (!content) return null;

  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {content}
    </svg>
  );
}
