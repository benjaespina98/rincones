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
| H. QA en la app corriendo (`sherlock`) | en curso al escribir esto | — |
| I. Fotos reales | **esperando confirmación para descargar** | — |

## Mediciones (2026-11-12)

| | Referencia | Ahora |
|---|---|---|
| server (`node --test`) | 650 | **705** |
| client (vitest) | 911 | **927** |
| tokens | 155/155 | **157/157** |
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

## Fotos reales (frente I): lo que se sabe

El usuario pidió que sean fotos **reales**, no inventadas ni genéricas. Unsplash y Pexels rechazan la
descarga automática (no se esquiva). Candidatas verificadas por la API de Wikimedia Commons (licencia
y autor leídos, falta abrir cada página para confirmar):

| Archivo en Commons | Autor | Licencia | Tamaño |
|---|---|---|---|
| Bodega chakana viñedo camino.jpg | Juan Pelizzatti | CC BY 3.0 | 2000×1312, 1,3 MB |
| Bodega chakana trabajador con uvas.jpg | Juan Pelizzatti | CC BY 3.0 | 1920×1476, 255 kB |
| Bodega chakana nieve y camino.jpg | Juan Pelizzatti | CC BY 3.0 | 2048×1371, 671 kB |
| Bicycle among olive trees and vineyards, Maipu, Mendoza.jpg | MendozaGuide | CC BY 4.0 | 1170×1463, 763 kB |

Todas exigen atribución visible. Irían a `client/src/assets/fotos/` en WebP con `srcset`, más una
sección de créditos, y habría que sumar `avif|webp|jpg|png` al regex de `client/public/sw.js:97`.

## Próxima tarea

1. Informe de `sherlock` (H) y corregir lo que encuentre.
2. Con confirmación del usuario, descargar las fotos de arriba e integrarlas (frente I).
