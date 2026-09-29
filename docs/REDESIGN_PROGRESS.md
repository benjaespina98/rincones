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
- [ ] **Fase 1 — Tokens y CSS**
- [ ] **Fase 2 — Componentes base**
- [ ] **Fase 3 — Shell y navegación**
- [ ] **Fase 4 — Mi Bodega**
- [ ] **Fase 4.5 — Descubrí y Sommelier**
- [ ] **Fase 5 — Ficha de vino unificada**
- [ ] **Fase 6 — Estados faltantes**
- [ ] **Fase 7 — Cierre**

---

## Pendientes conocidos, ajenos a este trabajo

- El merge `develop` → `main` quedó sin hacer (11 commits).
- `DeleteAccountModal.jsx` sigue sin montar: `DELETE /api/users/me` es accesible
  solo por API, no desde el perfil.
- El check de CI existe pero no bloquea hasta marcarlo como requerido en la
  protección de rama.
