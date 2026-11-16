// Puente a Sentry: reexporta SÓLO lo que la app usa.
//
// `import("@sentry/react")` directo trae el espacio de nombres entero y el bundler no puede
// descartar nada: 160 kB gzip en la primera visita. Con estos dos nombres explícitos el
// tree-shaking deja lo que `init` y `captureException` realmente necesitan.
export { init, captureException } from "@sentry/react";
