---
name: diseno-y-a11y
description: Reglas visuales, de CSS, accesibilidad, íconos y copy de Rincones. Usar al tocar cualquier .css, componente de UI, ícono o texto visible.
---

# Diseño y accesibilidad

## CSS
- **CSS plano**, sin Tailwind ni CSS-in-JS. Vive **al lado** de su componente/página; lo compartido va a `client/src/styles/shared/`.
- **Cero colores literales** fuera de `index.css`. Excepciones comentadas: Spotify, Mercado Libre y `@media print` (único lugar con el contraste al revés).
- El color se deriva de canales: `rgb(var(--accent-rgb) / 0.18)`, nunca un `rgba()` con números.
- **El tipo de vino es el hilo visual**: `data-wine-type` en un contenedor y todo lo de adentro hereda acento, gradiente, halo y banda (`--type-*`).
- Animar **sólo `transform` y `opacity`**. Respetar `prefers-reduced-motion`.
- **Todo campo de texto en 16px o más**: abajo, Safari en iPhone hace zoom al enfocar. Un componente puede subirlo, nunca bajarlo (el panel de admin es la excepción, a propósito).

### Trampa de `var()`
Una custom property resuelve sus `var()` contra el **elemento donde se declara**, no donde se usa. Por eso `--type-gradient`, `--type-glow` y `--type-rail` están declaradas **dos veces**: en `:root` y en `[data-wine-type]`. Un `var(--x)` sin declarar **no da error**: el navegador descarta la regla en silencio. Correr `npm run check:tokens -w client`.

## Radios, superficies y estados táctiles (pulido iOS, 2026-10-16)
- **Radios por rol**, nunca números sueltos: `--radius-card` 14, `--radius-control` 12 (botones, inputs, botones de ícono), `--radius-chip` 10, `--radius-tag` 8, `--radius-photo` 10, `--radius-fab` 16. `--radius-full` sólo para lo circular (avatares, puntos).
- **Superficies neutras**: la card es `--surface-card` (blanco 4,5%), borde `--border-card`, sombra `--shadow-card`; sin glows. El **violeta es acento** (primario, pestaña activa, foco, selección), no el tinte de las superficies. Borde de controles `--border-base`; lo activo o seleccionado, `--line-accent`.
- **Texto en tres niveles** medidos: `--text`, `--text-secondary` (≥ 7:1 sobre la card), `--text-muted` y `--text-subtle` (≥ 4,5:1). El dorado es sólo rating y favorito; el verde, "Ya lo tomé".
- **Hover sólo bajo `@media (hover: hover) and (pointer: fine)`**: en iPhone no hay hover y una regla suelta se queda pegada tras tocar.
- **`:active` en todo lo tocable**: `scale(.98)` (`.94` en botones de ícono) y un velo de luz por `opacity` (`::before`), 120ms, sólo `transform` y `opacity`. Ver "ESTADOS TÁCTILES" en `index.css`.
- **Lo anclado abajo**: la barra usa la zona segura entera (`--nav-safe-bottom`), y todo lo que cuelga de ella (`--nav-height`, `--vp-gap`) está en tokens; no escribir alturas de barra a mano.

## Accesibilidad (AA)
- Targets ≥ 44 px, foco visible, `aria-label` en botones de ícono.
- El contraste se **mide**, no se estima (`getComputedStyle` + cálculo del ratio).

## Íconos
`client/src/components/Icon.jsx`: set propio, SVG en grilla de 24, `stroke-width: 2`, con variantes `filled` (corazón, estrella, copa, botella). **Ya se probó una librería y se volvió atrás**: lucide 6,4 kB vs 2,4 kB propio; Phosphor 35,2 kB y sus rellenos no combinan con el trazo fino. Tampoco SF Symbols (licencia). No reabrir el tema.

## Copy
Español **rioplatense, de vos**. Sin `dangerouslySetInnerHTML`.

## Prettier
Evaluado y **no adoptado**: reformatearía 316 archivos y rompería el `git blame` de comentarios que guardan el porqué. Si algún día se adopta: commit propio y `.git-blame-ignore-revs`.
