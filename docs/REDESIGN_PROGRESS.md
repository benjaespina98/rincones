# Rediseño v2 — progreso

Rama: `feat/redesign-v2`, sacada de `develop`. Sin push ni merge.

Este archivo existe para poder retomar el trabajo en otra sesión: qué está hecho,
qué se decidió y por qué, y qué queda.

---

## Línea base (medida antes de tocar nada)

| | |
|---|---|
| `npm test -w server` | 339/339 |
| `npm test -w client` | 214/214 |
| `npm run lint -w client` | limpio |
| `npm run build` | OK |
| Carga inicial | **≈118 kB gzip** — entry 71,9 + vendor 35,7 + CSS 9,9 |
| Presupuesto | no pasar de **~143 kB gzip** (+25 kB) |
| Literales de color fuera de `index.css` | **84 hex** y **206 `rgba()`** distintos |
| Convenciones de carpeta CSS | 4 a la vez |

Comandos de medición, para repetirlos igual al cerrar:

```bash
npm run lint -w client && npm test -w client && npm test -w server
npm run build
grep -rhoE "#[0-9a-fA-F]{3,8}\b" client/src --include=*.css | sort -u | wc -l
grep -rhoE "rgba?\([^)]*\)" client/src --include=*.css | sort -u | wc -l
```

---

## Decisiones

### Convención de CSS

**El CSS vive al lado de su componente o de su página**: `components/Foo.jsx` +
`components/Foo.css`.

La excepción son las hojas que comparten varios componentes, que van a
`client/src/styles/shared/`. Co-locar una hoja sin dueño único sería elegir un
dueño falso: el próximo que la edite no tiene forma de saber que la están usando
otros cuatro.

Hojas compartidas y quién las usa:

| Hoja | La usan |
|---|---|
| `SettingsSheet.css` | BodegaFilters, ConceptSheet, PreferencesEditor, WinePlan, WineRecipeSheet |
| `DiscoverSections.css` | ExploreFeed, FeaturedEvent, WineShops |
| `ConfirmModal.css` | ConfirmModal, DeleteAccountModal |
| `WinePlan.css` | WinePlan, WineRecipeSheet |
| `ConceptTerm.css` | ConceptTerm, ConceptSheet |

Quedan además, fuera de esa regla y a propósito: `index.css` (tokens y base,
importado una vez desde `main.jsx`) y `App.css` (layout de la cáscara).

### Contraste

Medido de verdad, con la fórmula de luminancia relativa de WCAG, contra los dos
extremos del degradado de `--app-bg` (`#090b13` arriba, `#111626` abajo).

- `--text-subtle` era `#7b7798` y daba **4.23** sobre `#111626`: **falla AA** para
  texto normal en la mitad inferior de todas las pantallas. Pasa a `#8783a7`
  (**5.00**).
- `--accent` (`#7e59c9`) da 3.57 como texto: **no se toca**, porque es identidad y
  se usa como relleno, donde la regla es otra. Para texto y links se usa
  `--accent-text`, alias de `--accent-light` (`#a782ef`, **6.07**).
- Los cinco colores por tipo de vino ya pasaban AA (7.52 a 13.32). Sin cambios.

### Animación

Sin librería. CSS (`transform` / `opacity`) y View Transitions API para el
shared-element, con degradación elegante donde no esté. Si aparece una animación
de layout que CSS no resuelve, se reevalúa `motion` y se justifica acá.

---

## Fases

- [x] **Fase 0 — Preparación.** Rama creada, línea base medida, este archivo.
- [x] **Fase 1 — Tokens y CSS**
  - [x] Canales RGB, tres superficies, sombras en capas, bordes translúcidos.
  - [x] Tokens por tipo de vino, con el hilo `data-wine-type`.
  - [x] Corrección de contraste (`--text-subtle`, `--accent-text`).
  - [x] Styleguide en `/styleguide`, solo en DEV. Verificado que no entra a `dist`.
  - [x] Fuera los 11 bordes punteados.
    - [x] Migrados los literales: **84 hex -> 4** y **206 rgba -> 4**. Los 8 que
        quedan son excepciones con su comentario (Spotify, Mercado Libre, y la
        hoja de impresion, que es el unico lugar con el contraste al reves).
  - [x] Unificadas las 4 convenciones: `components/` 31, `pages/` 16,
        `styles/shared/` 6.
- [ ] **Fase 2 — Componentes base** — en curso
  - [x] Button, Card, Chip, WineTypeBadge, BottomSheet.
  - [x] useSheet con trampa de foco (Tab que cicla).
  - [x] Segmented con indicador deslizante.
  - [x] WineArtwork con una forma por tipo (bordeaux, borgoña, champagne, oporto).
  - [x] Guarda `npm run check:tokens -w client`, ya en el CI.
  - [ ] Skeletons con la forma real del contenido.
  - [ ] EmptyState con una ilustracion por contexto.
  - [ ] Sumar los componentes nuevos al styleguide.
  - [ ] Adoptarlos en las pantallas (hoy conviven con los botones viejos).
- [ ] **Fase 3 — Shell y navegación**
- [ ] **Fase 4 — Mi Bodega**
- [ ] **Fase 4.5 — Descubrí y Sommelier**
- [ ] **Fase 5 — Ficha de vino unificada**
- [ ] **Fase 6 — Estados faltantes**
- [ ] **Fase 7 — Cierre**

---

## La guarda de tokens

`npm run check:tokens -w client` verifica que todo `var(--x)` usado en las hojas
este declarado. Existe por un bug propio: `--bg-rgb` y `--bg-deep-rgb` se usaban
y nunca se declararon. Un token sin declarar **no da error** — el navegador
descarta la regla en silencio y el estilo desaparece, sin rastro en consola y sin
que se note mirando la pantalla. Ya corre en el CI.

## Cosas del entorno que hacen perder tiempo

**El backend no queda donde el cliente lo busca al levantar el preview.**
`npm run dev` arranca los dos workspaces con `concurrently`, y el harness que
lanza el preview exporta `PORT=5173` para Vite. Esa variable la hereda también
el server, y como `server/src/server.js` hace `process.env.PORT || 4000`, gana
la del entorno por encima del `PORT=4000` del `.env`: el backend anuncia 5173,
que ya es de Vite, y el cliente le pega a 4000 sin encontrar a nadie. La app
carga y muestra "No pudimos conectarnos".

No es un problema del proyecto ni del rediseño. Para revisar pantallas que
necesitan datos, levantar el server aparte con el puerto explícito.

**Pantallas que se pueden revisar sin backend:** `/styleguide`, `/login`,
`/register`. Para el resto hace falta el server arriba.

## Pendientes conocidos, ajenos a este trabajo

- El merge `develop` → `main` quedó sin hacer (11 commits).
- `DeleteAccountModal.jsx` sigue sin montar: `DELETE /api/users/me` es accesible
  solo por API, no desde el perfil.
- El check de CI existe pero no bloquea hasta marcarlo como requerido en la
  protección de rama.
