# Auditoría integral: progreso

Rama: `audit/calidad-integral` (sale de `develop` en `b4d58d1`). Sin push, sin merge, sin deploy.
Base de datos usada: **`test`**. Nunca `rincones`.

Este archivo existe para poder retomar el trabajo en otra sesión.

## Estado por frente

| Frente | Estado |
|---|---|
| A. Ediciones a medias de la sesión anterior (+ `graceCount`, + tests) | **hecho** |
| B. `accountExport` select con nombres equivocados | pendiente |
| C. Cuatro altos de negocio (deshacer, consumo sin botella) | pendiente |
| D. Seguridad confirmada (imágenes externas, mongoose, nonce, límites, contraseñas) | pendiente |
| E. Tests de lo más riesgoso (`authenticate`, `requireAdmin`, `refresh`, filtro por dueño) | pendiente |
| F. Rendimiento (Sentry puente, `manualChunks`, CI) | pendiente |
| G. UX/UI (contrastes AA, `document.title`, toasts, `--control-md`, etiquetas) | pendiente |
| H. QA en la app corriendo (`sherlock`) | pendiente |
| I. Fotos reales (Wikimedia Commons, licencias verificadas) | pendiente |

## Línea base

Referencia de `CLAUDE.md` (2026-11-07): client 911, server 650, tokens 155/155, lint limpio,
carga inicial ~143 kB gzip de presupuesto.

Medición propia: server 650/650 al arrancar. Tras el frente A: **server 659/659**, lint limpio.

## Frente A: hecho

Ediciones heredadas, ahora revisadas, con test y suite corrida:

| Archivo | Cambio | Test |
|---|---|---|
| `labels.service.js` | `errorHandler` en `createWorker` (un fallo de Tesseract tiraba el proceso) | `labelsOcrFailure.test.js` |
| `labels.controller.js` | OCR fallido o HEIC → 503 con mensaje, no 500 | (cubierto por el 503 del servicio; sin test de controlador) |
| `sommelier.controller.js` | Si la persona se fue, no se guarda respuesta enlatada ni se registra error | `sommelierStream.test.js` (verificado por mutación: falla sin la guarda) |
| `catalog.controller.js` | Falla de Gemini en ficha/receta/maridaje → 503 previsto | `catalogAiFailure.test.js` |
| `gemini.service.js` | API key en cabecera `x-goog-api-key`, no en la URL | `geminiStream.test.js` (stream y no-stream) |
| `session.service.js` + `refreshToken.model.js` | Tope de 3 re-canjes de un refresh usado; `graceCount` declarado en el esquema | `sessionRotation.test.js` |

Sin test propio: el 503 de `labels.controller.js` (requiere montar multer + sharp). Queda anotado.

## Entorno encontrado al retomar

- Puerto 4000: un server (`nodemon src/server.js`) vivo, contra la base `test` (verificado en `.env`,
  `.env.local` no la pisa). Puerto 5173: libre.
- Base `test`: 24 usuarios. 11 `qa-...@example.com` / `qa-...@b.c` creados el 2026-11-12 ~02:48 UTC
  por el agente de QA cortado; más 8 antiguos `@test.local` y 2 `qa_...`. **Nada borrado.**

## Pendientes que NO se deciden solos

- Rate limits en memoria sobre serverless (hace falta store compartido).
- Exigir `emailVerified` para gastar cuota de IA.
- Borrado de imágenes en Cloudinary al borrar vino o cuenta.
- Access token en `localStorage`.
- Subir `multer` a 2.x.
- Sumar `mongodb-memory-server` o correr el E2E (Playwright, `client/e2e/`) en CI.

## Próxima tarea

Frente B (`accountExport.service.js:51` y `accountExport.test.js:76`), luego C.
