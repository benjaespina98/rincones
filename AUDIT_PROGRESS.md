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

## Backlog de producto (pedido por el dueño)

- **Panel admin: rediseño general.** Quedó viejo respecto del resto de la app y en el celular hay partes
  que no se ven bien (por ejemplo, la parte de arriba se ve cortada). Revisar a 375, 768 y 1280 px:
  cabecera, navegación, tablas y formularios; usar los mismos tokens y componentes que la app (Chip,
  BottomSheet, botones), áreas táctiles de 44 px y tipografía unificada. Excepción actual: el admin usa
  campos de texto de menos de 16 px a propósito; decidir si se unifica.
- **Mi Bodega: cabecera que se achica al scrollear** (buscador, pestañas y filtros ocupan mucho antes del
  primer vino) e indicador deslizante entre pestañas.
- **Sommelier: receta y servicio integrados al chat** (hoy hay una línea de servicio por vino y el botón
  «Qué cocinar»; falta decantar/airear con criterio por vino y unir la receta con la ficha).
- **Fotos de más bodegas**: Casarena, Mosquita Muerta, Fabre Montmayou, Trapiche, Norton, Trivento,
  Salentein, El Esteco, Nieto Senetiner, Finca Las Moras. Crédito visible «Foto: bodega» y contacto para
  pedir baja.
- **Escaneo**: medir la precisión de la lectura (nombre, uva, cosecha, reserva, corte, barrica) con fotos
  reales de varias bodegas; la mejora de corte/crianza/graduación está hecha y probada sólo con tests.
- **Accesibilidad táctil**: áreas bajo 44 px (stepper 32, pestañas 40, insignias de grilla 34).

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

Fotos de producto de las propias bodegas (no genéricas ni inventadas), cargadas en la base **test** con scripts de `server/scripts/`. Pool de `test`: 154 fotos.

| Bodega | Fotos | Script | Fuente / particularidad |
|---|---|---|---|
| Luigi Bosca | 21 | `descargarFotosLuigiBosca.js` + `recortarFondoBlanco.js` | og:image de cada ficha, fondo blanco |
| Catena Zapata | 20 | `descargarFotosCatena.js` + `rotarBotellasAcostadas.js` | la bodega publica la botella acostada |
| Rutini | 50 | `descargarFotosRutini.js` + `recortarFondoBlanco.js` | 806×1600, una por etiqueta de cada línea |
| Zuccardi | 13 | `descargarFotosZuccardi.js` + `recortarFondoBlanco.js` | PNG con transparencia; **los nombres de archivo de Serie A están cruzados en su sitio** (Malbec ↔ Bonarda): el mapeo se verificó mirando la etiqueta |
| Susana Balbo | 5 | `descargarFotosSusanaBalbo.js` | API pública del sitio (una consulta) |
| Piattelli | 13 | `descargarFotosPiattelli.js` + `recortarFondoBlanco.js` | sitio Wix sin texto en las imágenes: mapeo mirando etiquetas; PNG de hasta 13 MB que se achican a 2000 px |
| Matías Riccitelli | 33 | `descargarFotosRiccitelli.js` + `recortarFondoBlanco.js` | API de su tienda WooCommerce |

- Sin foto de producto en el sitio de la bodega: Catena Alta, Nicolás Catena Zapata, White Stones (sólo ambiente); Zuccardi Santa Julia, Fuzión, Aluvional; Rutini Blend of Terroirs y Finca Centenaria; BenMarco.
- Séptima: su sitio oficial no responde (conexión cortada / certificado vencido): sin fotos. Faltan por revisar: Casarena, Mosquita Muerta, Fabre Montmayou, Trapiche, Norton, Trivento, Salentein, El Esteco, Nieto Senetiner.
- Bodega Noemía: tiene 3 botellas (A Lisa, J Alberto, Noemía) pero ninguna coincide con el vino cargado («Cabernet Franc»); no se importó. Baron B: sin sitio oficial encontrado.
- **Licencia:** son fotos de las bodegas, sin licencia abierta. Falta el crédito visible («Foto: bodega») y un contacto para retiros.
- Los vinos sin foto propia muestran la del pool si tiene puntaje ≥ 70 (`wineImages.conFotoConfiable`, sólo lectura): no hace falta recargarlos.
- Las fotos que suben los usuarios no se tocaron: siguen yendo a Cloudinary.

### Pasar las fotos a producción (lo hace el usuario, nunca el agente)

Las fotos **ya están en Cloudinary**; el pool sólo guarda la URL. No hay que volver a subir nada: se copian los documentos de `test` a `rincones`.

```bash
cd server
# 1) Simulacro: lista qué copiaría y no escribe nada
npm run copiar:fotos -- --origen=test --destino=rincones
# 2) Copiar de verdad (hay que repetir el nombre de la base destino)
npm run copiar:fotos -- --origen=test --destino=rincones --aplicar --confirmo-destino=rincones
```

- Sólo copia fotos con puntaje ≥ 70 y URL de nuestro Cloudinary; si el vino ya tiene foto en producción, la respeta (`--force` para pisar; `--bodegas=Rutini,Zuccardi` para acotar).
- Probado con una base de ensayo (se creó y se borró): simulacro, frena sin confirmación, copia todas y una segunda corrida las salta. Hoy serían 154 fotos.
- Es reversible: borrar de `rincones.wineimages` las claves copiadas devuelve el estado anterior (las fotos de Cloudinary no se tocan).

## Próxima tarea

1. Revisar el diff completo y abrir PR a `develop` (no hecho: la regla de esta auditoría es sin push).
2. Decidir las cinco decisiones de arriba.
