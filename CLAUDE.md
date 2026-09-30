# Rincones

Bodega personal de vinos con sommelier IA. Monorepo npm workspaces (`client/`,
`server/`). **Tiene usuarios reales**: `main` despliega producción en Vercel.

Este archivo se carga solo en cada sesión. Está para que no haya que
re-descubrir lo mismo cada vez — sobre todo las trampas del entorno, que cuestan
media hora si no están escritas.

---

## Verificar (siempre, antes de cerrar cualquier cosa)

```bash
npm run lint -w client          # eslint. El server no tiene lint todavía.
npm run check:tokens -w client  # todo var(--x) usado tiene que estar declarado
npm test -w client              # vitest
npm test -w server              # node --test
npm run build                   # vite build
```

Referencia actual: **client 221/221**, **server 339/339**, lint limpio, tokens
136/136. Los conteos pueden subir, nunca bajar.

Carga inicial: **≈118 kB gzip** (entry 72,2 + vendor 35,8 + CSS 10,4).
Presupuesto: no pasar de ~143 kB.

## Flujo de ramas

`feature` → **PR a `develop`** → borrar la feature → `develop` → `main`.
Nunca un PR de una rama de trabajo directo a `main`. La rama feature se borra
**después** de mergear (borrarla antes cierra el PR): `gh pr merge --delete-branch`.

Nada llega a producción hasta el merge a `main`; un merge local no despliega.

---

## Trampas del entorno (esto es lo que hace perder tiempo)

**Git no tiene identidad configurada.** Ni global ni local. Los commits necesitan
pasarla a mano, con la misma que firma el historial:

```bash
git -c user.name=benjaespina98 -c user.email=83318957+benjaespina98@users.noreply.github.com commit ...
```

**Git se queja de "dubious ownership".** El repo figura creado por otro usuario de
Windows. Se esquiva por comando con
`git -c safe.directory=D:/Win10/Desktop/UTN/z/Proyectos/rincones ...`, o se
arregla una vez con `git config --global --add safe.directory <ruta>`.

**`gh` no está en el PATH.** Instalado por winget, hay que llamarlo por ruta:
`$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe`

**El backend no queda donde el cliente lo busca.** El harness del preview exporta
`PORT=5173` para Vite, y `npm run dev` levanta los dos workspaces juntos: el
server hereda esa variable, pisa el `PORT=4000` de su `.env` y anuncia 5173, que
ya es de Vite. La app muestra "No pudimos conectarnos". Para pantallas con datos,
levantar el server aparte con `PORT=4000` explícito.

Sin backend se pueden revisar: `/styleguide`, `/login`, `/register`.

**El panel del navegador pinta inestable.** Las capturas salen en blanco o a
medio pintar. Verificar con **estilos computados** (`javascript_tool`) y tests
automatizados, no con screenshots.

**Los archivos son CRLF.** Un reemplazo multilínea con `\n` no matchea: usar
regex con `\r?\n`, o `sed` por número de línea.

**No hay Python.** Para scripts de una vez, usar Node.

---

## Reglas del código

- **JavaScript, no TypeScript.** No migrar.
- **CSS plano**, sin Tailwind ni CSS-in-JS. El CSS vive **al lado** de su
  componente o página; las hojas que comparten varios componentes van a
  `client/src/styles/shared/`.
- **Cero colores literales** fuera de `index.css`. Las únicas excepciones tienen
  su comentario: Spotify, Mercado Libre y la hoja de impresión (`@media print`,
  el único lugar con el contraste al revés).
- El color se deriva de canales: `rgb(var(--accent-rgb) / 0.18)`, nunca un
  `rgba()` con los números escritos.
- **El tipo de vino es el hilo visual**: `data-wine-type` en un contenedor y todo
  lo de adentro hereda acento, gradiente, halo y banda (`--type-*`).
- Animar **solo `transform` y `opacity`**. Respetar `prefers-reduced-motion`.
- Accesibilidad AA: targets ≥ 44 px, foco visible, `aria-label` en botones de
  ícono. El contraste se **mide**, no se estima.
- Copy en **español rioplatense, de vos**.
- Sin `dangerouslySetInnerHTML`. La salida de Gemini es dato no confiable.
- **Todo campo de texto va en 16px o más.** No es estético: abajo de ese umbral
  Safari en iPhone hace zoom solo al enfocarlo, y no se puede desactivar desde
  la página. El valor por defecto está en `index.css`; un componente puede
  subirlo, nunca bajarlo. (El panel de admin tiene seis reglas que sí bajan: es
  escritorio y quedó fuera a propósito.)

### Los íconos son propios, y así se quedan

`src/components/Icon.jsx` tiene el set completo dibujado a mano: SVG trazados en
grilla de 24 con `stroke-width: 2`, más un puñado de variantes rellenas
(`filled`) para corazón, estrella, copa y botella.

**Ya se probó reemplazarlo por una librería y se volvió atrás.** Se evaluaron
tres caminos, con el bundle medido:

| | 52 íconos gzip | |
|---|---|---|
| set propio (el actual) | 2,4 kB | |
| `lucide-react` | 6,4 kB | |
| `@phosphor-icons/react` | 35,2 kB | no entra en el presupuesto: trae los 6 pesos de cada ícono y no tiene entrada por peso |

Se llegó a implementar la geometría de Phosphor extrayendo sólo el peso regular
(6,6 kB) y **se descartó por criterio visual**: los íconos rellenos de Phosphor
no combinan con el resto de la app, que es de trazo fino. Si vuelve a salir el
tema, la conclusión es que el problema no era el peso del bundle.

**No se usan SF Symbols de Apple**: `sf-symbols-react` no existe en npm, y la
licencia de Apple permite usarlos para diseñar apps de plataformas Apple pero
prohíbe copiarlos y redistribuirlos — que es lo que sería meterlos en un bundle
web servido a cualquier navegador.

### Una trampa de CSS que ya mordió

Una custom property resuelve sus `var()` contra el **elemento donde se declara**,
no donde se usa. Por eso las recetas del tipo (`--type-gradient`, `--type-glow`,
`--type-rail`) están declaradas **dos veces**: en `:root` para el caso sin tipo, y
en `[data-wine-type]` para que resuelvan contra el tipo de ese elemento.

Y un `var(--x)` sin declarar **no da error**: el navegador descarta la regla en
silencio. De ahí `npm run check:tokens`, que ya corre en CI.

---

## Modelo de datos, lo que más se malinterpreta

El estado de un vino son **tres ejes independientes**, no uno:

| | |
|---|---|
| `quantity` | stock (suma de `remaining` de `lots[]`, invariante sostenida por hooks y pipelines) |
| `tasted` | lo probaste alguna vez — **no** implica que no te quede stock |
| `favorite` | corazón |

Las pestañas de Mi Bodega son **vistas** sobre esos ejes: un vino puede estar en
varias a la vez. `status` está **deprecado**, no contar por él.

`config/db.js` separa las bases: `rincones` es **producción**, `test` es
desarrollo. **Nunca** correr scripts ni migraciones contra producción.

---

## Dónde está el estado del rediseño

`docs/REDESIGN_PROGRESS.md` — fases hechas, decisiones con su porqué, y el
próximo paso exacto. **Leerlo antes de escribir código.**
