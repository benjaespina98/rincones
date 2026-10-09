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

## Accesibilidad (AA)
- Targets ≥ 44 px, foco visible, `aria-label` en botones de ícono.
- El contraste se **mide**, no se estima (`getComputedStyle` + cálculo del ratio).

## Íconos
`client/src/components/Icon.jsx`: set propio, SVG en grilla de 24, `stroke-width: 2`, con variantes `filled` (corazón, estrella, copa, botella). **Ya se probó una librería y se volvió atrás**: lucide 6,4 kB vs 2,4 kB propio; Phosphor 35,2 kB y sus rellenos no combinan con el trazo fino. Tampoco SF Symbols (licencia). No reabrir el tema.

## Copy
Español **rioplatense, de vos**. Sin `dangerouslySetInnerHTML`.

## Prettier
Evaluado y **no adoptado**: reformatearía 316 archivos y rompería el `git blame` de comentarios que guardan el porqué. Si algún día se adopta: commit propio y `.git-blame-ignore-revs`.
