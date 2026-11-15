# Auditoría integral: progreso

Rama: `audit/calidad-integral` (sale de `develop` en `b4d58d1`). Sin push, sin merge, sin deploy.
Base de datos usada: **`test`**. Nunca `rincones`.

Este archivo existe para poder retomar el trabajo en otra sesión.

## Estado por frente

| Frente | Estado | Commit |
|---|---|---|
| A. Ediciones a medias de la sesión anterior (+ `graceCount`, + tests) | hecho | `33d948b` |
| B. `accountExport` excluía campos inexistentes | hecho | `c6ed5d7` |
| C. Cuatro altos de negocio (deshacer, consumo sin botella) + hallazgos de messi/pirlo | hecho | `c268de3`, `4263175` |
| D. Seguridad (imágenes del catálogo, mongoose, nonce, topes, contraseñas, analytics) | hecho | `2f52a85`, `a9d3bbb` |
| E. Tests de `authenticate`, `requireAdmin`, `refresh`, dueño | hecho | `b7e3531` |
| F. Rendimiento (Sentry puente, `manualChunks`, CI) | hecho | `a98bba7` |
| G. UX/UI (contrastes AA, título, toasts, 44 px, etiquetas) | hecho (parcial, ver abajo) | `5bcbcfe` |
| H. QA en la app corriendo (`sherlock`) | hecho (hallazgos corregidos) | `5bcbcfe` |
| I. Fotos reales de botellas (bodegas) | hecho para Luigi Bosca (21) y Catena (20), en `test` | `f573220`, `8b6db08`, `f3ccb64`, `0f61b4c` |

## Mediciones (2026-11-12)

| | Referencia | Ahora |
|---|---|---|
| server (`node --test`) | 650 | **708** |
| client (vitest) | 911 | **929** |
| tokens | 155/155 | **158/158** |
| lint | limpio | limpio |
| carga inicial gzip | ~143 kB de tope | **124,4 kB** (entry 18,8 + vendor 93,4 + CSS 12,1) |
| chunk de Sentry (sólo con DSN) | 160 kB | **29,3 kB** |
| `npm audit --omit=dev` | — | 0 vulnerabilidades |

## Qué se corrigió

**Negocio.** `adjustStock` exige precondiciones en el filtro del update (abrir n exige `quantity >= n`,
deshacer apertura exige `consumptionCount >= 1`, deshacer reposición exige esas botellas) y responde
409 con mensaje; `tasted` al deshacer fuera de orden se decide con `consumosAntes`; los avisos con
«Deshacer» refrescan el caché y las listas montadas aunque la pantalla ya no exista; deshacer un alta
que vino de un deseo devuelve el deseo (hook y escáner).

**Seguridad.** Catálogo comunitario sólo guarda `data:image` o Cloudinary propio; mongoose 9.12.1;
nonce de Google obligatorio; `validarVino` rechaza no-strings; topes en momentos, deseos y búsqueda;
`limpiarPassword` único (restablecer no recortaba y dejaba cuentas que no podían entrar); cambiar
contraseña en cuenta sólo-Google da 400; login sin oráculo de tiempo (inexistente y sólo-Google gastan
bcrypt); analytics con `req.ip` y forma válida de `type`; API key de Gemini en cabecera.

**IA/servicios.** Tesseract con `errorHandler` (un fallo tiraba el proceso); OCR/HEIC fallido → 503;
falla de Gemini en ficha/receta/maridaje → 503; cancelación del Sommelier no guarda respuesta enlatada;
tope de 3 re-canjes de un refresh usado.

**Rendimiento y CI.** Puente de Sentry; `manualChunks` como función; CI con `timeout-minutes`, build,
presupuesto (`client/scripts/check-bundle.cjs`) y `npm audit`.

**UI.** `--accent-fill-hover` (6,14:1) y `--danger-fill` (5,03:1) reemplazan hover 2,42:1 y confirmar
3,69:1; `document.title` por pantalla; errores 7 s; `--control-md` 44 px; 13 etiquetas visibles en el
editor de vino.

## Pendientes confirmados que NO se tocaron (con el porqué)

- **CSP `img-src`** en `client/vercel.json`: puede romper fotos externas que usuarios ya tienen
  guardadas; hace falta medir qué hosts hay en la base real antes.
- **Datos ya guardados** en el catálogo comunitario con URL ajena siguen sirviéndose (la lectura usa
  el piso de formato). Hace falta un `migrate:*` aditivo, probado en `test`.
- **Cuentas cuya contraseña quedó con espacio al borde** (por restablecer sin trim) no pueden pasar
  `currentPassword` ni la baja; la salida es «Olvidé mi contraseña». Grupo mínimo.
- **Analytics `byPath`** acepta rutas arbitrarias (hasta 80 caracteres): lista cerrada de rutas.
- **`validarVino`** no revisa `image`, `rawText`, `currency`, `cellarShelf`: un objeto ahí da 500, no 400.
- **Nonce de Google** sólo lo valida el cliente; probar en iPhone real (PWA standalone, `sessionStorage`).
- **Medios de negocio** de `messi` (devolución cruzando lotes, `lastConsumedAt`, fecha de compra a
  medianoche UTC, borrado en lote sin `winePrices.retract`, identidad de deseo sin uva, reseña bajo clave
  vieja, momentos sin editar/borrar): sin tocar, requieren decisión de producto.
- **UX**: 14 áreas táctiles bajo 44 px, 56 clases CSS muertas, `BottomSheet`/`Button`/`Card` casi sin
  adoptar, copy inconsistente (probado/tomado, mail/correo), `Google Fonts` bloquea el render, CSS de la
  ficha en `App.jsx`, `GET /wishes` de más en tres pantallas, `wine-stats` sin caché.
- **Sin test**: el 503 de `labels.controller.js` (requiere multer + sharp) y el cambio de
  `ScanWinePage.jsx` (deseo al deshacer; patrón: `scan-merge-sin-deshacer.test.jsx`).
- El test `diario-invitacion.test.jsx` falló una vez bajo carga y pasó en aislamiento y en la
  corrida completa siguiente: posible flaky, sin investigar.

## Decisiones que no se toman solas

- Rate limits en memoria sobre serverless (hace falta store compartido: Mongo con TTL o Redis).
- Exigir `emailVerified` para gastar cuota de IA.
- Borrado de imágenes en Cloudinary al borrar vino o cuenta.
- Access token en `localStorage`.
- Subir `multer` a 2.x.
- Sumar `mongodb-memory-server` o correr el E2E (Playwright, `client/e2e/`, 8 specs) en CI.

## Entorno encontrado al retomar

- Puerto 4000: server vivo (`nodemon`), base `test` (verificado). Puerto 5173 libre.
- Base `test`: 24 usuarios; 11 `qa-...` creados el 2026-11-12 ~02:48 UTC por el agente de QA cortado.
  **Nada borrado.**

## Fotos reales (frente I)

Se usan fotos de producto de las propias bodegas (no genéricas ni inventadas), con `server/scripts/`:

| Bodega | Fotos | Cómo | Estado |
|---|---|---|---|
| Luigi Bosca | 21 | `descargarFotosLuigiBosca.js` (og:image de cada ficha, 1,2 s entre pedidos) + `recortarFondoBlanco.js` | cargadas en `test` |
| Catena Zapata | 20 | `descargarFotosCatena.js` + `rotarBotellasAcostadas.js` (la bodega publica la botella acostada: se gira 90°) | cargadas en `test` |

- Sin foto de producto (sólo hay fotos de ambiente): Catena Alta, Nicolás Catena Zapata, White Stones, Alta Cabernet/Chardonnay.
- Luigi Bosca sin página de producto: Finca Los Nobles, Gala 1, Gala 3, La Linda, Riesling.
- Son fotos de las bodegas, **sin licencia abierta**. Falta el crédito visible («Foto: bodega») y un contacto para retiros.
- Descubrí prioriza vinos con foto confiable (`universoConFoto`, `conFotoPrimero`).
- Las fotos que suben los usuarios no se tocaron: siguen yendo a Cloudinary.
- **Producción: la carga la hace el usuario**, nunca el agente. Orden: bajar → recortar/rotar → `npm run import:images -- --dir=… --dry` → sin `--dry`.
- Sin usar ni commitear: `client/src/assets/fotos/` y `FotoPaisaje.*` (paisajes de Chakana, CC BY 3.0). Se pueden borrar.

## Próxima tarea

1. Revisar el diff completo y abrir PR a `develop` (no hecho: la regla de esta auditoría es sin push).
2. Decidir las cinco decisiones de arriba.
