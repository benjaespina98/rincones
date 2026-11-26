# Rediseño v2 — progreso

Rama: `feat/redesign-v2`. Las fases 0 a 2 ya estan en `main` (PR #104 a develop,
#105 a main); la rama se recreo desde ahi para seguir con las fases 3 a 7.

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
| Al cerrar la fase 2 | entry 72,2 + vendor 35,8 — **+0,4 kB** sobre la linea base |
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

### Cuándo se adoptan los componentes en las pantallas

Las fases 4 a 6 **reescriben** BodyPage, las dos fichas de vino, ScanWine,
Discover y Suggestions. Adoptar Button/Card/Chip ahí ahora sería hacer el mismo
trabajo dos veces, así que la adopción va donde de verdad rinde: dentro de
`EmptyState` y `ErrorState`, que la propagan a los veinte lugares donde hay un
vacío o un error y que ninguna fase posterior reescribe. El resto adopta en su
propia fase, cuando esa pantalla se toca.

**Alternativa descartada:** adoptar en las doce pantallas ahora. Da un commit
más vistoso y se tira en la fase siguiente.

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
- [x] **Fase 2 — Componentes base**
  - [x] Button, Card, Chip, WineTypeBadge, BottomSheet.
  - [x] useSheet con trampa de foco (Tab que cicla).
  - [x] Segmented con indicador deslizante.
  - [x] WineArtwork con una forma por tipo (bordeaux, borgoña, champagne, oporto).
  - [x] Guarda `npm run check:tokens -w client`, ya en el CI.
  - [x] EmptyIllustration: seis dibujos, uno por SITUACION (cava, copa,
        favoritos, busqueda, diario, resenas).
  - [x] EmptyState conectado, y los 18 usos migrados: no queda ningun `icon=`.
  - [x] Los ocho componentes en el styleguide, con variantes Y estados.
  - [x] Tests del BottomSheet (7), que encontraron un bug del filtro de foco.
  - [x] Skeletons con la forma real de la tarjeta (banda del tipo, radio y
        superficie de Card) y brillo neutro en vez de violeta.
  - [x] Trampa de foco endurecida: ignora hidden, inert y disabled (8 tests).
  - [x] EmptyState y ErrorState adoptan Button.
- [x] **Fase 3 — Shell y navegación**
  - [x] Barra inferior con glass (con respaldo `@supports`) e indicador que se
        desliza; en escritorio se apaga y queda la marca vertical del sidebar.
  - [x] Título grande que colapsa: el grande vive en el contenido y se va con el
        scroll, el de la barra aparece por opacidad (`useHeaderCollapse`).
  - [x] Botón de cámara: halo de acento y anillo corregido (estaba al 92% de
        opacidad contra una barra que ahora es glass al 62%).
  - [x] Fade en el borde inferior, colgado de la barra y no del contenedor que
        scrollea — ese no siempre es el que scrollea.
  - [x] Base de transiciones con View Transitions (`utils/viewTransition.js`).
        El shared-element de la foto queda sin cablear a propósito: las
        tarjetas y la ficha se reescriben en las fases 4 y 5.
  - [x] Toasts con deshacer: ya existían (`Toast` acepta `action` y
        `action.secondary`). No se construye nada; se usa donde haga falta.
- [x] **Fase 4 — Mi Bodega**
  - [x] Buscar/filtrar/ordenar a `utils/bodegaFiltros.js`, con 23 tests.
  - [x] `utils/bodegaResumen.js` + `BodegaResumen`: cabecera de métricas de lo
        que se está viendo.
  - [x] Corregida la contradicción: el botón "Sin probar" dentro de la pestaña
        Probados ahora dice "Desmarcar probado".
  - [x] La fila sale a `WineRow` (451) + `WineRowPanel` (217), memoizada.
        BodyPage: **1910 → 1374 líneas**. Las acciones del padre pasaron a
        `useCallback`, y hay tests que cuentan renders para que siga siendo
        cierto.
  - [x] Filtros y orden en `BottomSheet`; los 13 chips propios y las fichas de
        filtro activo pasan a `Chip`.
  - [x] Toggle lista/grilla con transición de layout: cada fila lleva su
        `view-transition-name`. Sin librería.
  - [x] En grilla, la foto llega a los bordes y se funde con los datos por un
        degradado con el color del tipo.
  - [x] Deslizar una fila revela corazón y tacho (`hooks/useSwipeAcciones.js`).
        Revela, no ejecuta.
  - [x] Entrada escalonada: ya estaba en CSS (`.wine-row:nth-child(n)`), se
        verificó que sigue viva después de partir el componente.
  - [ ] Pendiente menor: la barra de selección múltiple sigue dentro de
        BodyPage. No molesta —son ~40 líneas— pero es lo próximo si el archivo
        vuelve a crecer.

### Bugs que aparecieron mirando la app andando

Ninguno de los tres lo habría encontrado un test, y los tres estaban en
código propio de fases anteriores:

| Qué | Dónde |
|---|---|
| `<button>` adentro de `<button>`: el navegador sacaba la ✕ de la cápsula | `Chip.jsx` |
| El chip de probado salía 17px por encima de la tarjeta y el `overflow` lo cortaba al medio | `.wines-list--protagonista … .wine-row__tasted` |
| Migrar a `Chip` bajaba la altura táctil de 40 a 34 y deshacía una corrección de accesibilidad | `Chip.css` |

- [x] **Fase 4.5 — Descubrí y Sommelier**
  - [x] El hilo del tipo llega a la primera pantalla: la tarjeta destacada y
        cada resultado de búsqueda llevan `data-wine-type`. Antes un blanco, un
        espumante y un oporto se veían los tres violetas.
  - [x] Las tarjetas de la respuesta del Sommelier llevan la banda de su tipo.
  - [x] El arranque del Sommelier era dos tiras de chips separadas por 370px de
        nada: ahora es un solo bloque.
  - [x] El placeholder del compositor estaba cortado al medio a 375px: el campo
        mide 41px y el texto pedía 62.
  - [x] Migrados a `Chip` los cuatro clones de las pantallas rediseñadas
        (`bfilters__chip`, `bodega-ficha`, `wine-search__chip`, `somm__chip`).
        **Quedan sin migrar** `toggle-chip`, `settings-chip`, `wine-meta-chip`,
        `admin-chip` y `sk-chip`: viven en pantallas de las fases 5 y 6 y
        migran ahí.
  - [x] Sin tocar, a propósito: `useKeyboardInset`, la persistencia en
        `sessionStorage` y el compositor fijo. Ya estaban bien resueltos.
- [x] **Fase 5 — Ficha de vino unificada**
  - [x] El encabezado toma el color del tipo. Importa sobre todo sin foto, que
        es la mayoría de las fichas recién cargadas.
  - [x] `WineDetailHero`: un solo encabezado para las dos fichas. La del
        catálogo era una copia recortada que se había quedado atrás (sin fondo
        ambiental, sin marco dorado, sin color del tipo).
  - [x] `WineDetailNav`: barra pegajosa con Resumen · Plan · Cata · Comunidad. **Retirada el 2026-10-18**: no llevaba bien a la sección y el usuario prefirió una ficha de un solo scroll. El botón de cámara flotante también se retiró: Escanear es un lugar de la barra, con nombre.
        Navega, no esconde — ver el porqué en el componente.
  - [x] `WineMoments` (269) y `WineDetailEditor` (252) salen de la página.
        **`WineDetailPage`: 1488 → 1048 líneas.** Movidos tal cual, sin
        renombrar: un refactor que mueve y reescribe a la vez no se revisa.
  - [ ] Queda sin hacer: partir el modo lectura en Resumen / Cata / Comunidad.
        La página ya está en 1048 y los tres bloques que faltan comparten
        mucho estado con la pantalla; conviene hacerlo con una necesidad real
        adelante, no por el número.
- [x] **Fase 6 — Estados faltantes**
  - [x] **`PromoReportPage`**: tenía un solo booleano para "falló", así que un
        corte de red decía "el enlace puede haber caducado" y no ofrecía
        reintentar. Ahora distingue 404/410 (el enlace no vale más) de
        cualquier otra cosa (el camino), y esta última tiene `ErrorState` con
        reintentar. El "Cargando…" pasa a `LoadingSkeleton`. Verificado
        apagando la API de verdad.
  - [x] **`ScanWinePage`: ya estaba resuelto** antes de esta fase, al revés de
        lo que decía el plan. `LabelScanner` guarda el error en estado y dibuja
        un bloque persistente con "Sacar otra foto" y "Cargar a mano".
        Comprobado con la API apagada y una imagen inyectada: el error queda en
        pantalla, no es un toast.
  - [x] `OnboardingPage`: cada tipo de vino se enciende con su color. Sus
        estados ya eran correctos (el fallo deja el botón habilitado para
        reintentar).
  - [x] `GoogleCallbackPage`: sin cambios. Ya distingue cancelación, nonce
        vencido, token ausente y caída de red, y vuelve a `/login` con el
        mensaje que corresponde. Una URL de callback no se puede reintentar en
        el lugar: el código ya se consumió.
- [x] **Fase 7 — Cierre**
  - [x] **375×667 y 375×812**: cero scroll horizontal en Mi Bodega, Sommelier,
        Descubrí, Agregar y Perfil. Lo único que se pasa del borde son las
        tiras que se deslizan a propósito (`.bres`, `.somm__rail`).
  - [x] **`prefers-reduced-motion`**: encontró un agujero real. El CSS no puede
        apagar un `scrollIntoView({behavior:"smooth"})` escrito en JS, y había
        tres. Sale a `utils/scroll.js` con cuatro tests.
  - [x] **Contraste medido, no estimado** (fórmula WCAG contra el fondo real,
        acumulando las capas translúcidas):

        | | |
        |---|---|
        | nombre del vino / número del resumen | 17,85 |
        | uva y año | 10,76 |
        | chips de tipo activos | 6,22 a 9,90 |
        | etiqueta del resumen, bodega | 6,36 |
        | pestaña activa | 6,25 |
        | detalle del resumen | 5,39 |
        | chip de orden activo | 5,28 |

        Todo por encima de 4,5. El más bajo es el detalle del resumen.
  - [x] **Literales de color**: siguen siendo sólo las excepciones documentadas
        —Spotify, Mercado Libre y la hoja de impresión—. La migración de la
        fase 1 aguantó seis fases.
  - [x] Borradas `.page-header`, `.btn-wish` y `.cellar-ready__hint`. Revisadas
        una por una: el detector automático marcaba 136 clases y la mayoría
        eran falsos positivos (`btn--${variant}` y compañía se arman en tiempo
        de ejecución).

### Dos bugs de fondo que aparecieron en la fase 5

| Qué | Dónde |
|---|---|
| **`position: sticky` no funcionaba en ninguna pantalla.** `.app-content` dice ser el área que scrollea (`overflow-y`, `scroll-padding-bottom`, `-webkit-overflow-scrolling`) pero su padre era un bloque suelto, así que crecía con el contenido y el que scrolleaba era el documento. Son cuatro líneas de CSS. **Cambia quién scrollea en todas las pantallas** — verificado a mano en las cuatro principales, más el colapso del título, una hoja y la barra inferior. | `AppLayout.css`, `App.css` |
| `Segmented` movía el scroll VERTICAL de la página al cambiar de opción: su `scrollIntoView` recorre todos los ancestros y, con la cápsula pegajosa, usa la posición estática. Se veía como que la página volvía sola. Nunca se había notado porque era la primera vez que una cápsula era sticky. | `Segmented.jsx` |

---

## El rediseño está cerrado. Qué falta antes de mergear

Las siete fases están hechas. Lo que queda **no es del rediseño** y conviene
decidirlo con la cabeza fresca:

1. **Probarlo en un teléfono de verdad.** Todo lo de arriba se verificó en el
   navegador integrado con la ventana emulada a 375px. Eso alcanza para el
   layout, el contraste y los estados; no alcanza para el gesto de deslizar una
   fila con el pulgar, ni para el teclado real tapando el compositor, ni para
   `standalone` en iOS.
2. **Revisar el cambio de scroll** (fase 5). Es lo único de todo el trabajo que
   toca todas las pantallas a la vez. Verificado a mano en las principales,
   pero es lo primero que hay que mirar si algo se ve raro.
3. El merge: `feat/redesign-v2` → PR a `develop` → `main`.

## Parte B — funcionalidad nueva, no capa visual

- [x] **B1 · Historial del Sommelier.** Modelo, tres endpoints, guardado del
      lado del servidor y hoja de archivo. Lo escribe el server y no el cliente
      para que nadie pueda guardarse una respuesta que la app nunca dio, y
      **ninguna consulta busca sólo por `_id`** — una charla tiene lo más
      personal que guarda la app.
- [x] **B3 · Llevarse los datos.** `GET /api/users/me/export`, con un test que
      compara el inventario del export contra el del borrado para que no se
      desincronicen.
- [x] **B4 · Cuenta.** `DeleteAccountModal` estaba escrito y **no lo montaba
      ninguna pantalla**: la baja sólo se alcanzaba por API.
- [x] **B5 · Service worker.** Escrito alrededor del bug que esta app ya tuvo:
      el documento se pide siempre a la red primero, y sólo se cachean los
      assets con hash, que son inmutables. `/api` no se toca.
- [x] **B6 · Endurecimiento.** Límite propio para la exportación (10/hora,
      verificado). **Prettier evaluado y descartado** — ver CLAUDE.md.
- [x] **B2 · Descubrí.** Las filas de videos, cursos y vinotecas no tenían
      superficie —eran ícono y texto sobre el fondo— al lado de la tarjeta
      destacada ya rediseñada. Ahora usan los mismos cuatro valores que la fila
      de Mi Bodega. Y los tres encabezados de sección estaban en 17/700, 18/800
      y 21/800: ahora los tres en 18/800.
- [x] **Legales.** `/privacidad` y `/terminos`, escritas auditando el código que
      las cumple — en el comentario de cada página están los archivos citados,
      para que si alguno cambia se note que la página quedó mintiendo. Van
      **fuera del gate de sesión**: la decisión de entregar los datos se toma
      antes de crear la cuenta.

### Los datos del responsable

Completos en las dos páginas: responsable, domicilio (ciudad), email de contacto
(una casilla propia de la app, no la personal), jurisdicción (Argentina) y
autoridad de control (AAIP, Ley 25.326). Si alguno cambia, se cambia en
`PrivacidadPage.jsx` **y** en `TerminosPage.jsx`, que repite los mismos datos.

**Fuera del código, y a cargo del titular:** la ley argentina suele pedir
registrar la base de datos de usuarios ante la AAIP (Registro Nacional de Bases
de Datos). No es algo que la app pueda hacer sola; conviene confirmarlo con un
profesional antes de anunciar las páginas como definitivas.
## Medición final

| | Línea base | Al cerrar |
|---|---|---|
| lint | limpio | limpio |
| tokens declarados | — | 136/136 |
| tests de client | 214 | **284** (35 archivos) |
| tests de server | 339 | **355** |
| carga inicial | 118,0 kB gzip | **119,5 kB** (entry 72,85 + vendor 35,76 + CSS 10,87) |
| presupuesto | ~143 kB | sobra **23,5 kB** |
| `BodyPage.jsx` | 1965 líneas | **1374** |
| `WineDetailPage.jsx` | 1488 líneas | **1048** |
| literales de color fuera de `index.css` | 84 hex · 206 rgba | 5 hex · 3 rgba, **todos con su comentario** |

Cinco fases de trabajo visual por **1,5 kB**. No entró ninguna librería: las
transiciones de layout las hace el navegador (View Transitions), el gesto de
deslizar son 100 líneas de hook, y las ilustraciones son SVG escrito a mano.

**Medición al cerrar la fase 5:**

| | |
|---|---|
| lint | limpio |
| tokens | 136/136 declarados |
| client | **264/264** (32 archivos) |
| server | 339/339 |
| carga inicial | entry 72,83 + vendor 35,76 + CSS 10,97 = **119,6 kB gzip** |
| presupuesto | ~143 kB (queda margen de 23,4) |

El presupuesto casi no se movió en cinco fases: la transición de layout, el
gesto de deslizar y la barra de secciones no trajeron ninguna librería.

## Cómo probar la app con datos, sin tocar producción

El backend no arranca donde el cliente lo busca (ver más abajo). Para revisar
pantallas con vinos de verdad:

1. `PORT=4000 node src/server.js` desde `server/`. El `.env` local apunta a la
   base **`test`**; `config/db.js` explota si falta el nombre, justamente para
   que nunca caiga en producción por descarte.
2. Crear un usuario de prueba por la API (`/auth/register` + `/auth/login`) y
   cargarle unos vinos por `POST /api/wines`.
3. El registro deja la cuenta sin verificar y la app la manda a
   `/verificar-email`: marcar `emailVerified: true` en la base `test`.
4. El token va en `localStorage` bajo `rincones_token` y dura 15 minutos.

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

- `client/vercel.json` apunta el rewrite de `/api` a la API de **producción** también
  en los previews, y la API de producción rechaza por CORS cualquier origen que no
  esté en su lista. Resultado: un preview de rama no puede iniciar sesión, y aunque
  pudiera escribiría en la base real. Para probar se usa el entorno local contra la
  base `test`; una API de preview con su propia base es una decisión de infraestructura.
- El check de CI existe pero no bloquea hasta marcarlo como requerido en la
  protección de rama.

## Mi Bodega: pulido móvil (2026-10-14)

Rama `fix/mi-bodega-ui`. Tres temas, con su porqué:

**La barra de navegación "aparecía arriba" al abrir (iOS standalone).** El shell
(`.app-layout`) se dimensionaba con `100vh`/`100dvh` y la barra es
`position: fixed; bottom: 0`: dos mediciones del mismo borde que en iOS
standalone no siempre coinciden al abrir, así que la barra quedaba más arriba que
el fondo del contenido hasta que un scroll forzaba el relayout. Ahora el shell es
`position: fixed; inset: 0`: una sola referencia, sin unidades de viewport ni
offsets por modelo. El documento deja de scrollear (`html:has(.app-layout)`).
**No se pudo reproducir en Chromium** (ahí ya era coherente); se verificó que la
geometría sea idéntica y que no haya scroll de documento, pero queda **por
confirmar en un iPhone** abriendo la PWA desde el ícono.

**El pie de la tarjeta de lista** (chip "Ya lo tomé" y botón "más") se ubicaba con
`left: 97px` y `bottom: 8px` absolutos: la suma a mano de 12 + 72 + 13. Ahora es
una grilla con `--wine-thumb-w`, `--wine-row-gap` y `--wine-action-h` declaradas
una vez. El chip va al eje de la foto, y el chip y el botón comparten fila y alto
(medido: top 462, alto 40 los dos).

**Contraste y atmósfera.** Fondo más oscuro (`--bg` #090a11) con el violeta como
halo profundo (`--accent-strong`) en vez de claro; tarjetas con tinte violeta;
textos atenuados un escalón arriba; líneas más marcadas. Peor caso medido: texto
subtle 4,61 y acento claro 4,64 sobre la punta clara de la tarjeta (AA = 4,5).

**Foto con `fit="auto"`.** `cover` salvo que la imagen sea más angosta que 0,5
(botella de catálogo recortada), donde `contain` evita comerle pico y base.

**Sensación de app** (bloque al final de `App.css`): `touch-action: manipulation`
(sin retardo de 300 ms), controles no seleccionables, velo de presión en las filas,
scrollbar oculta en táctil.

Detectado de paso, previo y arreglado: en grilla a 390px el corazón y el chip se
pisaban 6px; ahora el chip va sólo-ícono por debajo de 411px.

## Pulido visual iOS de Mi Bodega (2026-10-16)

Rama `fix/barra-viewport-ios`, commits atómicos, **sin publicar**. Se pidió un pulido, no un
rediseño: mismo layout, información y copy; íconos y marca intactos.

### Corrección de lo que quedó mal diagnosticado de la barra
La tanda anterior bloqueó el documento (`html:has(.app-layout) { overflow: hidden }`) creyendo que
así la barra y el contenido compartían referencia. Era un error: en una PWA de iOS el viewport de
layout puede ser ~58px más corto que la pantalla al abrir, y lo que lo recalculaba era justamente el
scroll del documento. Al bloquearlo, el hueco quedó fijo (medido en capturas: la barra terminaba a
60pt del borde). Ahora el documento vuelve a scrollear, `useViewportGap` empuja el recálculo y
compensa con `--vp-gap` lo que quede, y `?vp=1` muestra los números del teléfono. **Sigue sin
poder reproducirse fuera de un iPhone: confirmar abriendo la PWA desde el ícono.**

### Tabla antes / después (390×844, estilos computados)
| | Antes | Después |
|---|---|---|
| Fondo de página | #110f1f con halo violeta .38 y halo vino .20 | #14161f (ink) con un único halo de acento al 11% |
| Encabezado | banda propia, 60,8px, degradé .92→.66 | transparente, 49,6px; blur sólo al scrollear |
| Título "Mi Bodega" | 30/800/-0.025em, **debajo** del avatar | igual, **en la fila del avatar** (centros 29,6 = 29,6) |
| Card | borde violeta, degradé #362f5a→#241f3e, radio 12 | blanco 4,5%, borde blanco 8%, sombra en dos capas, radio 14 |
| Borde de controles (`--line`) | violeta .26 | blanco .10; el acento (.45) sólo en lo activo |
| Botón grilla / filtros | 48×48, círculo | 48×48, radio 12 |
| Buscador | píldora, borde violeta | radio 12, borde blanco .10 |
| Selector de vista | píldora, indicador píldora | contenedor radio 14, indicador radio 12 con borde de acento |
| Nombre del vino | 17/700 | 17/700, tracking -0.01em |
| Tipo | 12,8/800 texto suelto | etiqueta 28px, radio 8, fondo del tipo al 14%, 13/600 |
| Uva / bodega | 12,8/400 · 12/400 | 13/500 · 13/400, secundarios |
| Cantidad | 18,4/800 **dorada** | etiqueta neutra 24px, 13/700 tabular |
| Chevrones por card | 2 (">" y "⌄") | 1 ("⌄", toque de 44×44) |
| "Ya lo tomé" | 40px, píldora, verde .07/.30 | 36px, radio 12, verde .16/.40, toque 44 |
| Barra inferior | 59px, reservaba inset-22, blur 26 sat 1.8 | 93px con inset 34, inset entero, blur 24 sat 1.6, borde blanco .10, sin sombra |
| Pestaña activa | #f3f5ff 600 | acento claro (#cbb5f7) 700; inactiva #b0b5c6 600 |
| Botón de cámara | 52 círculo, **centrado** (tapaba Sommelier) | 56×56 radio 16, a la derecha, 11px sobre la barra |

### Contraste medido (peor caso: hover sobre el pico del halo; sobre la card entre paréntesis)
Primario 10,7 (14,4) · secundario 7,1 (9,6; el pedido era ≥ 7) · muted 5,9 · subtle 4,7 (≥ 4,5) ·
acento claro 4,9 · etiqueta de tipo sobre su fondo tinteado 5,3–8,3 · "Ya lo tomé" 8,0.

### Decisiones propias (no estaban en el pedido)
- **Base #14161f** (opción "ink con elevación iOS"): conciliaba "neutra" con la queja anterior de que
  el fondo era demasiado negro.
- `--radius-fab` 16px: el pedido decía `--radius-control` de 16, pero ese token es 12.
- **Radios por rol en toda la app**, no sólo Mi Bodega: `.chip` (10), `Segmented` (14/12), el buscador de
  Descubrí (12) y el "⌄" (12). Si no, Descubrí y la ficha quedaban con un criterio distinto.
- El título sube con la barra superpuesta (absoluta) y no con margen negativo: este último lo sacaba
  de la caja del contenedor que scrollea y lo recortaba (lo medí y lo corregí).
- Pestaña activa en `--accent-soft` y no en el violeta pleno: el violeta pleno es *menos* luminoso que
  el gris de las inactivas y la activa se veía apagada.
- Tipo de vino a 600 y no 500: legible sobre el fondo tinteado.
- Barra con el inset **entero** (lo pedido): las etiquetas quedan a 43px del borde, donde las pone una
  barra nativa; es un solo token (`--nav-safe-bottom`) si se quiere más abajo.
- Hover: 99 selectores en 42 hojas pasaron a `(hover: hover) and (pointer: fine)` con un codemod,
  verificado con postcss (2.392 reglas, idénticas salvo el envoltorio).
- `.wine-row` animaba con `fill-mode: both`, que fija el `transform` final e impedía el `scale` de
  :active; pasó a `backwards`.

### Sin verificar
La barra en un iPhone real (ver arriba), el tacto del `:active` (no se siente con mouse), fotos reales
con `fit="auto"` y las vistas "Ya tomados" y "Favoritos" con el fondo nuevo.

---

## Última tanda de pulido (2026-10-19)

Rama `refresh/ultima-tanda`, un commit por frente (F, A, B, C, D, E). **Sin push ni merge**: queda para
revisar y publicar con `/publicar`.

| Frente | Qué cambió | Decisión y porqué |
|---|---|---|
| **F** cosecha | `utils/vintage.js`: `leerCosecha` / `hayValorDeCosecha`, un solo lugar | Los lotes no traen cosecha y la lección del día abre la hoja sin vino: el ancla de "añada" decía "no tiene" cuando no correspondía. NV y rangos ("2019/20") no son error. `propio` distingue ficha propia de consulta |
| **A** conceptos | 37 conceptos reescritos (definición, ejemplo, "En tu copa:"), voseo, 40 a 70 palabras; lectura 16px, interlineado 1,55, 12px entre párrafos | Test que falla ante rayas largas o medias en textos visibles (AST con `@babel/parser`, devDependency). Prompts del server sin ellas |
| **B** Descubrí | `GET /api/catalog/featured` sólo devuelve vinos con foto (`utils/destacados.js`, candidatos x8); el cliente también filtra y descarta fotos que fallan | Sin foto no se recomienda. Estado vacío con acción "Sumá una foto" |
| **C** barra | 5 lugares: Descubrí / Mi bodega / Escanear (centro) / Sommelier / Cuenta; sin avatar arriba; punto de admin en Cuenta | Revisar a 360, 390 y 430 |
| **D** escaneo | Va directo a la captura; confirmación como lista con un solo primario (Guardar); marca con punto de acento lo no leído o dudoso | "Solo consultar" y "Quiero probarlo" quedan como links chicos; se agregó el selector de Tipo; deshacer vuelve a `/bodega` |
| **E** lector | Ver abajo | |

### E: lector de etiquetas

Hecho (no depende de fotos):
- `utils/imagenCabecera.js`: el tipo y las dimensiones salen de la firma del archivo (JPEG, PNG, WebP, HEIC), sin dependencias. El endpoint rechaza con 400 y un mensaje claro (no es foto, muy chica, muy grande) **antes** de llamar al modelo, y le pasa a Gemini el mime detectado, no el declarado.
- `utils/promptSeguro.js`: el texto leído de la etiqueta, los nombres guardados y lo que escribe la persona se limpian y van delimitados como dato en los prompts de verificación, ficha, receta, búsqueda, plato y resúmenes del Sommelier.
- `normalizarTipo` en `vision.service`: el enum se normaliza también del lado del servidor.
- 23 tests nuevos en el server.
- Se mantienen 2000 px / 0,92 (decisión tomada).

**Pendiente (necesita fotos reales):** `server/scripts/medirLector.js`, escrito y **sin ejecutar**. Mide cada foto a 1280, 1600 y 2000 px: tiempo, tamaño del envío, campos leídos y vacíos, confianza. Uso: `node server/scripts/medirLector.js <carpeta>` con la clave de Gemini en el entorno y `npm install --no-save sharp` (no entra al package.json). No toca ninguna base. Con sus resultados se decide si bajar `SCAN_MAX_DIM`.

### Sin verificar
iPhone real (la barra, el empuje de 2px en modo standalone), cámara real, calidad de lectura de etiquetas reales.

### Pendientes de la tanda, resueltos después (2026-10-19)
- Áreas táctiles de 44px (sin cambiar lo que se ve) en la acción y el cierre del aviso y en los términos del glosario. Medido en la ficha: un toque a 13px del texto cae en el botón.
- La foto del Sommelier usa la misma validación de imagen que el escáner (tipo real y topes de tamaño; ahí no se exige poder medir) y manda a Gemini el tipo detectado.
- Preferencias de gusto: tope de 40 caracteres por ítem.
- "2019/20": no era un hueco real. El modelo guarda la cosecha como número y el lector (`normalizeVintage`) ya se queda con el primer año; un "NV" o un rango no puede llegar a guardarse.
- Siguen abiertos: `server/scripts/medirLector.js` sin ejecutar (faltan fotos reales); iPhone real, cámara real y calidad de lectura sin verificar.

### Descubrí y Mi Bodega: tarjeta entera, sumar stock, selección y filtros (2026-10-20)
Decisiones, con su porqué:
- **La tarjeta de recomendación aparece entera o no aparece:** esqueleto completo hasta que la foto carga (tope de 2,5 s, precarga de la siguiente). Antes llegaba el texto y la foto después. Sin ícono en el motivo, con una línea de maridaje por uva (guía general, a revisar por alguien que sepa) y "Quiero probarlo".
- **Recomendar con foto primero, nunca vacío:** el universo suma el catálogo comunitario con foto (sólo verificados o con una lectura confiable) y las fotos del pool; se rankea primero entre los que tienen foto y se completa con los demás. La foto de los comunitarios se trae sólo de los 8 elegidos (son data URL y pesan).
- **Sumar stock:** "Sumar botellas" (o "Tengo stock de nuevo") en el panel del vino, con hoja de cantidad, total resultante y Deshacer. Conserva el historial: sólo vuelven a haber botellas.
- **Selección:** mantener apretado una fila entra en el modo selección con ese vino elegido. La barra suma Sumar y Editar (tipo, región, guardado en), los dos con **Deshacer** (la edición guarda lo que cada vino tenía antes y lo devuelve vino por vino). Si algo falla a medias quedan elegidos sólo los que faltan, porque sumar no es idempotente.
- **Filtros:** fichas rápidas por Tipo, Uva, Región o Bodega con cantidades; en el panel, bodega y puntaje mínimo. El puntaje va en la línea de la bodega (no se superpone con la cantidad).
- **Deshacer tras eliminar** ahora también re-vincula los momentos del diario al vino restaurado (`restauraDe`, sólo los de esa persona).
- **La región del lote** se elige de una lista (las que ya usás y las conocidas) para que no se escriba distinto en cada vino.

Sigue sin verificar: iPhone real (la pulsación larga y el callout de iOS, que se suprimió por CSS), cámara real y correos reales. Playwright sigue sin instalar: agrega una dependencia y la descarga de navegadores, y queda a decisión de quien mantiene el proyecto.

### Stepper, selección, recomendación y Cuenta (2026-10-20)
- **Marcar una botella tomada:** el "−" junto a la cantidad es "Tomé una botella" (descuenta del lote más viejo, marca el vino como probado y ofrece Deshacer y "Contá el momento"); el "+" suma una. Un solo gesto para lo más frecuente, sin abrir el panel. Sólo en las vistas En stock y Probados, no en la grilla ni en modo selección.
- **Selección:** sólo eliminar. Favorito, sumar y editar son cosas de cada vino y se hacen de a uno; se borró el código del lote (BulkEditSheet, deshacerLote, enLote, camposDelLote). El chip dice "Ya lo probé".
- **Recomendación de Descubrí:** el universo es catálogo + comunidad, menos lo que ya tenés y lo que guardaste para probar. Las uvas pesan por frecuencia; lo que puntuaste siempre bajo resta. Variación diaria y por persona, 12 resultados, fotos primero. El servidor devuelve `motivo` por vino: razones concretas ("Tomás Malbec (2 en tu bodega)") y un porcentaje de coincidencia (puntos ganados sobre los alcanzables con tu perfil; sólo con base mínima, y la tarjeta lo muestra desde 50%). Inspirado en el "Match for You" de Vivino.
- **Cuenta:** "Tu perfil" (los números) va primero y la lista de ajustes pasa abajo bajo "Cuenta"; bordes neutros, íconos de la lista sin tinte violeta, sin salto al pasar el mouse.
- Sigue sin verificar: iPhone real, cámara real, latencia de `/catalog/featured` en producción.

### Ajustes tras probar en el teléfono (2026-10-20)
- **Deslizar una fila:** la capa de acciones (♥ y tacho) quedó sin ancla cuando la animación de entrada pasó a `backwards` (ya no deja un `transform` que la contenga) y se medía contra la pantalla: al deslizar salía una franja de punta a punta. `.wine-row` ahora es `position: relative`.
- **Stock en un solo lugar:** el stepper de la fila es la única puerta ("−" = tomé una botella, "+" suma una, tocar el número suma varias). Se sacaron "Abrí una botella", "Sumar botellas" y "Tengo stock de nuevo" del panel, que queda con ♥, tacho y, donde no hay chip, marcar/desmarcar probado. Sin stock, el stepper es sólo el "+" (sin "0"). Abrir varias de una sigue en la ficha.
- **El "+" garabateado** en Ya tomados y Favoritos era el chevron dibujándose debajo del stepper. En el archivo el stepper se corre a su izquierda y el chip "Ya lo probé" sale de la fila (se maneja desde el panel).
- **Descubrí:** la recomendación ya no se renueva sola (cambiaba a los pocos segundos); cambia con "Ver otro". La tarjeta muestra una sola razón en voz de persona y el medidor; se sacó la línea de maridaje y las razones de relleno. Las razones distinguen lo que tomó de lo que tiene en stock  y sólo afirman región o tipo con lo que efectivamente tomó.
- Código sin uso desde la UI (con sus tests): `data/maridajeCorto.js` y `hooks/useRotacionAutomatica.js`.
- **Tono de la razón (2026-10-21):** una frase que explica el porqué y recomienda en primera persona, siempre con un dato verdadero: "Como te gusta el Malbec, te recomiendo este vino", "Como tomaste Malbec, te recomiendo este vino", "Para que pruebes una uva nueva, te recomiendo este vino". (Se descartaron "este te va a cerrar" y las versiones con "botella".)

### Agregar a la bodega sin escanear (2026-10-21)
- **Desde la búsqueda de Descubrí y desde la ficha de catálogo** hay un "Agregar" que abre una hoja con una sola pregunta (cuántas botellas, 1/3/6/12 o a mano; o "lo tomé afuera" = sin botellas y ya probado). Sin cámara ni pantalla de revisión. La tarjeta pasa a "Agregado · N botellas" y el aviso trae Deshacer; si ya lo tenías, suma botellas. "Guardar" (para probar) queda como acción secundaria y, si lo habías guardado, el alta lo saca de Guardados.
- **Integridad:** el alta lleva `identification.matchedFrom: "busqueda-catalogo"`. El servidor no la deja salir "trusted" y no la aporta al catálogo comunitario: lo que vino del catálogo (o de Gemini) no puede pasar a ser carga humana verificada con un toque (hallazgo de messi).
- La cosecha entra vacía a propósito (una fila del catálogo es el vino, no la botella). Pendiente: si ya tenés ese vino con otra añada, el servidor crea otra fila sin año (el buscador marca como propio el que coincide); "Ya lo tengo" de Guardados sigue yendo a la pantalla de revisión completa.

### Botones del alta desde búsqueda y fotos (2026-10-21)
- En el teléfono, "No tengo botellas: lo tomé afuera" se dibujaba como botón blanco nativo (le faltaba su CSS) y "Agregar"/"Guardar" tocaban los bordes de la tarjeta: ahora la hoja la dibuja como texto en acento y las acciones tienen 8px de aire arriba y abajo (medido: la tarjeta mide 110px y las acciones quedan a 8px de cada borde).
- **Foto pública = la mejor:** el margen para que una foto nueva desplace a la del pool bajó de 15 a 8 puntos de calidad (la puntúa Gemini). **Mi Bodega = mi foto:** al cargar un vino con foto propia manda esa; la del pool sólo completa cuando no escaneaste ninguna (test nuevo). Sin Gemini configurado no hay puntaje y el pool conserva la primera foto.

### Sommelier, líneas y variedad (2026-10-21)
- **Sin fotos en el Sommelier:** se sacó la cámara, el chip "Foto de un menú" y el selector del cliente; `POST /sommelier/photo` responde 410 sin leer nada ni llamar al modelo (cada imagen era una consulta de visión). Queda sin uso desde la UI `askPhoto`/`preguntarConFoto` con sus tests; borrarlos es un paso aparte.
- **Teclado:** mientras un campo de texto tiene el foco, `useKeyboardInset` marca `<html data-teclado="abierto">` y en el teléfono se esconde la barra de pestañas (y el campo del Sommelier baja al borde). La barrita con flechas y tilde que iOS dibuja sobre el teclado es del sistema: una web no puede sacarla.
- **Recomendar por líneas:** el perfil ahora conoce los productores y las líneas que tomás y el escalón en el que te movés (`puntosDeGama`: accesible 1, media 2, media-alta 2,5 —Piattelli, Luigi Bosca, DV Catena…—, alta 3). Con ≥3 vinos y un escalón ≥2,2 no se recomiendan líneas de entrada (un Portillo), se resta por cada punto por debajo, y se suma el productor que ya tomás. Quien toma vinos de entrada sigue recibiendo vinos de entrada.
- **Variedad:** cada razón tiene 2-4 formas de decirse, elegidas por vino+día (estables dentro del día) y siempre con el mismo dato verdadero; el saludo de la home también rota por día.
- **Sommelier:** prompt con el tono de Descubrí (cálido, en primera persona, sin muletilla fija), regla de líneas y productor en el contexto de la bodega; si el modelo falla o no responde se contesta con un respaldo local (algo de lo que puntuaste o una uva que casi nunca falla) en vez de un error, salvo con "otra opción" (ahí queda la respuesta anterior); lo fuera de tema ("generame un prompt") recibe una frase amable distinta según la pregunta.

## Escaneo sin carga manual, «Ya lo tomé» y avisos (2026-11-26)

- **El nombre nunca se le pide a la persona:** sin nombre legible se usa la bodega, y sin bodega la uva. Se sacó la
  confirmación «se llama igual que la bodega». Esos nombres de relleno (`esNombreProvisorio` en el servidor) no se
  funden con otro vino ni comparten foto, precio o ficha. Costo aceptado: reescanear la misma botella crea otra fila.
- Ajuste tras la revisión: un vino cuyo nombre la persona ya confirmó no cuenta como relleno (se sigue fundiendo);
  el relleno no suma foto al catálogo comunitario y en Guardados se distingue además por la uva.
- **El nombre se puede editar:** al tocarlo, el campo muestra lo escrito (componerlo recortaba el espacio final).
- **«Lo tengo / Ya lo tomé»** reemplaza al contador en cero, en la revisión y en el alta desde la búsqueda. Lo cargado
  ya tomado no muestra fecha: la única disponible es la de la carga.
- **Aviso:** abajo, sin borde de color; sube sobre los pies propios (`--toast-offset`) y se pausa con foco o puntero.
- Sin verificar: etiquetas y cámara reales, latencia del escaneo, iPhone.

**Corrección (2026-11-26, pedida por el dueño):** que el vino se llame como su bodega es normal. Se funde, comparte
foto, precio y ficha como cualquier otro; sólo la uva sin bodega cuenta como relleno. Al catálogo público sigue sin
publicarse salvo que el curado lo conozca. Costo aceptado: dos botellas distintas de la misma bodega, uva y año con el
nombre sin leer se suman en una.
