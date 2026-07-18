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
};

const FILLED = {
  heart:
    "M12 21s-7.5-4.9-10-9.4C.6 8.9 2 5.5 5.2 5.1c1.9-.2 3.4 1 3.8 2 .4-1 1.9-2.2 3.8-2 3.2.4 4.6 3.8 3.2 6.5C19.5 16.1 12 21 12 21Z",
  star: "M12 3.3l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.4 9.4l5.8-.8L12 3.3Z",
};

const HEART_OUTLINE =
  "M12 21s-7.5-4.9-10-9.4C.6 8.9 2 5.5 5.2 5.1c1.9-.2 3.4 1 3.8 2 .4-1 1.9-2.2 3.8-2 3.2.4 4.6 3.8 3.2 6.5C19.5 16.1 12 21 12 21Z";

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
