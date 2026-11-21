# API REST

Base: `/api`. Todas las rutas requieren autenticación (cookie de sesión o header
`Authorization: Bearer <token>`) salvo las marcadas como públicas. La lista sale de
`server/src/routes/`; ante una duda, ese código manda.

## Salud

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Estado del servidor y de la base |

## Autenticación (`/auth`)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | Público | Registro (valida mayoría de edad) |
| `POST` | `/auth/login` | Público | Inicio de sesión |
| `POST` | `/auth/google` | Público | Inicio de sesión con Google |
| `POST` | `/auth/refresh` | Público | Renovación del token con la cookie de refresh |
| `POST` | `/auth/logout` | Público | Cierre de sesión |
| `POST` | `/auth/forgot-password` | Público | Solicitud de recuperación |
| `POST` | `/auth/reset-password` | Público | Cambio de contraseña con token |
| `POST` | `/auth/verify-email` | Público | Verificación del mail |
| `GET` | `/auth/me` | Usuario | Usuario autenticado |
| `POST` | `/auth/resend-verification` | Usuario | Reenvío del mail de verificación |

## Cuenta (`/users`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` `PUT` | `/users/profile` | Perfil y preferencias |
| `PUT` | `/users/password` | Cambio de contraseña |
| `GET` | `/users/me/export` | Exportación de los datos de la cuenta |
| `DELETE` | `/users/me` | Baja de la cuenta |
| `GET` | `/users/stats` | Estadísticas del usuario |
| `GET` | `/users/:id/wine-stats` | Estadísticas de vinos de un usuario |

## Vinos (`/wines`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/wines` | Colección del usuario |
| `GET` | `/wines/search` | Búsqueda dentro de la colección |
| `GET` | `/wines/stats/summary` | Estadísticas de la bodega |
| `GET` | `/wines/stats/spending` | Gasto por período |
| `GET` | `/wines/cellar-ready` | Vinos listos para tomar |
| `GET` | `/wines/moments` | Todos los momentos del usuario |
| `POST` | `/wines/suggest` | Sugerencias según contexto |
| `GET` | `/wines/:id` | Detalle |
| `POST` | `/wines` | Alta |
| `POST` | `/wines/bulk` | Acción sobre varios a la vez |
| `PUT` | `/wines/:id` | Edición |
| `PATCH` | `/wines/:id/stock` | Ajuste de stock |
| `GET` `POST` | `/wines/:id/moments` | Momentos de degustación |
| `DELETE` | `/wines/:id` | Baja |

`POST /wines/bulk` (`{ ids, action }`, `action`: `tasted`, `untasted`, `favorite`, `unfavorite`, `delete`; máx. 200 ids)
responde `{ affected, ids, omitidos }`. Para `delete` **suma `inexistentes`**: los ids pedidos que ya no existen
(borrados desde otro dispositivo, o que no son tuyos). Contrato: `ids` = lo que la pantalla tiene que **quitar**
(los borrados ahora **más** los `inexistentes`, para que no queden fantasmas); `affected` = lo borrado de verdad
(`deletedCount`); `omitidos` = ids que pasaron el tope y NO se tocaron. Los contadores del perfil
(`stats.winesCount`, `stats.tastedWines`) se ajustan con un update atómico y sólo por lo realmente borrado.
`DELETE /wines/:id` de un vino que ya no está devuelve 404 y no descuenta nada.

## Quiero probar (`/wishes`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` `POST` | `/wishes` | Listar y agregar |
| `PATCH` | `/wishes/:id` | Editar |
| `DELETE` | `/wishes/:id` | Quitar |

## Catálogo y etiquetas (`/catalog`, `/labels`)

Los endpoints de IA tienen límite por minuto y por día.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/catalog/search` | Búsqueda en catálogo e IA |
| `POST` | `/catalog/describe` | Ficha generada de un vino |
| `POST` | `/catalog/recipe` | Receta para maridar |
| `POST` | `/catalog/pairing` | Maridaje |
| `GET` | `/catalog/featured` | Vinos destacados |
| `GET` | `/catalog/price` | Precio de referencia |
| `GET` `POST` `DELETE` | `/catalog/reviews` | Reseñas de la comunidad |
| `GET` | `/catalog/reviews/mine` | Reseñas propias |
| `POST` | `/labels/analyze` | Análisis de una foto de etiqueta |

## Sommelier (`/sommelier`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/sommelier/ask` | Pregunta con respuesta completa |
| `POST` | `/sommelier/ask-stream` | Pregunta con respuesta en streaming (SSE) |
| `POST` | `/sommelier/photo` | Pregunta con una foto |
| `GET` `DELETE` | `/sommelier/conversations` | Listar o borrar todo el historial |
| `GET` `DELETE` | `/sommelier/conversations/:id` | Una conversación |
| `PATCH` | `/sommelier/conversations/:id/feedback` | Valoración de una respuesta |

## Publicidad y campañas (`/promotions`)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/promotions` | Público | Campañas al aire |
| `POST` | `/promotions/events` | Público | Impresiones y clics |
| `GET` | `/promotions/report/:token` | Enlace | Informe del anunciante |
| `GET` | `/promotions/all` | Admin | Listado con estados |
| `GET` | `/promotions/:id/stats` | Admin | Métricas por campaña |
| `POST` `DELETE` | `/promotions/:id/report-link` | Admin | Generar o revocar el enlace del informe |
| `POST` | `/promotions` | Admin | Alta |
| `PUT` `DELETE` | `/promotions/:id` | Admin | Edición y baja |
| `PATCH` | `/promotions/:id/visibility` | Admin | Mostrar u ocultar |
| `PATCH` | `/promotions/:id/move` | Admin | Reordenar |

## Analítica (`/analytics`)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/analytics/collect` | Público | Ingesta de eventos |
| `GET` | `/analytics/summary` | Admin | Tablero de uso |

## Administración (`/admin`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/summary` | Números del panel |
| `GET` | `/admin/logs` | Registro de auditoría |
| `GET` | `/admin/logs/actors` | Autores del registro |
| `GET` | `/admin/error-logs` | Errores registrados |
| `GET` | `/admin/users` | Usuarios con su actividad |
| `PUT` | `/admin/users/:userId/role` | Cambio de rol |
| `DELETE` | `/admin/users/:userId` | Baja de un usuario |
| `DELETE` | `/admin/users/bulk` | Baja de varios usuarios |
| `GET` | `/admin/reviews` | Moderación de reseñas |
| `DELETE` | `/admin/reviews/:reviewId` | Baja de una reseña |
| `GET` `PUT` | `/admin/wine-images` | Búsqueda y asignación de fotos de vinos |
| `GET` | `/admin/wine-images/browse` | Explorar fotos |

### Analítica: reglas de medición

- **Quién no se mide.** `POST /analytics/collect` descarta (responde 204 igual) los eventos de una sesión
  con rol `admin` o con email de un dominio de prueba. Configurable por entorno:
  `ANALYTICS_EXCLUIR_ADMINS` (`0`/`false` para volver a medir admins; por defecto se excluyen) y
  `ANALYTICS_EXCLUIR_DOMINIOS` (dominios separados por coma; por defecto `example.test`, el de QA/E2E;
  vacío = ninguno). El rol sale del token: un admin sin sesión abierta es anónimo y se mide. Las
  mismas reglas dejan afuera a esas cuentas de las métricas de `growth`.
- **Topes anti-contaminación.** Límite por IP: 100 pedidos cada 5 min (`ANALYTICS_LIMITE_IP`; pasado el
  límite responde 204 sin registrar). Por día, los sets de hashes tienen techo: 5000 visitantes y 20000
  sesiones (`ANALYTICS_MAX_VISITANTES_DIA`, `ANALYTICS_MAX_SESIONES_DIA`); lleno el día, un visitante
  **nuevo** se descarta y los ya conocidos siguen contando. Ese tope es de **anónimos**: quien tiene sesión
  abierta cuenta contra tope + una reserva aparte (5000, `ANALYTICS_RESERVA_LOGUEADOS_DIA`), así que rotar el
  User-Agent desde una IP (el hash es IP+UA) ya no desplaza a los usuarios logueados. Además, una misma IP no
  puede sumar más de 20 visitantes **nuevos** por día (`ANALYTICS_MAX_NUEVOS_POR_IP_DIA`); se cuenta en
  memoria por instancia (la IP no se guarda), o sea que en serverless el tope real es por instancia. Los tipos de evento que manda el client
  (`pageview`, `cafecito_click`, `promo_click`, `wine_added`, `stock_added`, `bottle_opened`,
  `wish_added`, `scan_consult`, `sommelier_*`) están exentos del tope de 60 claves de `byType`: lo
  inventado va a `otro`, lo legítimo nunca se desplaza.
- **Privacidad de los hashes.** Los sets de visitantes del día sólo viven mientras el día está abierto:
  los días anteriores a ayer se cierran (`closed: true`), se vacían los sets y quedan los contadores.
  Al darse de baja una cuenta (propia o por admin) se borran sus eventos y los de su mismo
  (día, hash), se sacan sus hashes de los sets y se descuentan de los contadores de los días ya
  cerrados, así que ni `totals.visitors` ni `daily[].visitors` la recuerdan. Garantía:
  `totals.visitors >= max(daily[].visitors)` (si los eventos crudos dieron menos que el mejor día, se
  usa el del día).
- **La baja es reintentable.** Por cada día: se sacan los hashes de los sets del día abierto (idempotente), se
  borran los eventos de ese día y **sólo si el borrado borró algo** se descuenta del contador del día cerrado.
  Si falla antes del borrado no se descontó nada; si falla justo entre el borrado y el descuento, ese día queda
  con un visitante de más (nunca de menos). Si analytics falla, la baja **igual se completa** (se loguea y se
  desvincula el `userId` de los eventos): bloquear el derecho a irse por una falla de métricas es peor que ese
  resto, que además caduca (eventos 180 días, sets del día al cerrarlo).
- **Updates con pipeline.** Mongoose 9 rechaza un update en forma de array sin `{ updatePipeline: true }`. Todos
  los del server lo llevan (analytics, contadores del perfil, stock de vinos); un test lo exige.

### `GET /admin/summary` (números del panel)

Query: `hours` (1 a 720, default 24; para `activity`) y, para `growth`, `days` (default 30, máx. 365),
`from`/`to` (`YYYY-MM-DD`, calendario argentino) o `growth=0` para omitirlo. Respuesta
`{ data: { since, hours, users, admins, wines, reviews, activity: {total, create, update, delete}, growth } }`.
Todo lo anterior a `growth` no cambió. `growth` es `null` si `growth=0` o si su cálculo falló (el resto
llega igual). Forma de `growth` (admins y cuentas de prueba excluidos salvo donde se aclara; los
porcentajes son 0 a 100 con un decimal, y `null` cuando no hay base: "sin datos" no es 0 %):

```jsonc
{
  "range": { "days": 30, "from": "2026-10-23", "to": "2026-11-21" },
  "accounts": { "total": 120, "excluded": 9, "real": 111 },   // total = todas las cuentas; excluded = admins + pruebas
  "signups": {                                                  // cohorte: cuentas creadas en el rango
    "total": 14,
    "byMethod": { "google": 6, "password": 8 },                 // google = tiene googleId (creada o vinculada)
    "daily": [{ "day": "2026-11-20", "total": 2, "google": 1, "password": 1 }]   // todos los días del rango, en cero incluidos
  },
  "verified": 9, "verifiedPct": 64.3,                           // de la cohorte, con emailVerified
  "onboarded": 11, "onboardedPct": 78.6,                        // de la cohorte, con onboardedAt
  "activation": {                                               // cargó >= 1 vino dentro del plazo desde el alta
    "within24h": { "eligible": 12, "activated": 5, "pct": 41.7 },
    "within7d":  { "eligible": 9,  "activated": 6, "pct": 66.7 }
  },                                                            // eligible = cohorte a la que ya le pasó ese plazo
  "activeUsers": {                                              // por userId, desde AnalyticsEvent (retención 180 d)
    "asOf": "2026-11-21", "dau": 3, "wau": 11, "mau": 25,       // hoy / últimos 7 días / últimos 30 días (incluyen hoy)
    "stickinessPct": 12.0                                       // dau / mau
  },
  "accountDeletions": {                                         // bajas de cuenta (ChangeLog entityType "user", action "delete")
    "total": 4, "bySelf": 1, "byAdmin": 3,
    "daily": [{ "day": "2026-11-20", "self": 1, "admin": 0 }]
  },
  "wines": {
    "totalAdded": 80, "totalBottleOpenedEvents": 31,
    "daily": [{ "day": "2026-11-20", "added": 6, "bottleOpenedEvents": 2 }]
  }
}
```

Notas de lectura: `activeUsers` sólo cuenta gente con sesión abierta y no incluye admins ni pruebas (que además
ya no se registran, ver arriba); `dau` es el día de hoy en curso, no uno cerrado. `wines.daily[].added` sale de
`Wine.createdAt` (autoritativo, pero los vinos de cuentas dadas de baja ya no existen); `bottleOpenedEvents` es
la cantidad de veces que el client disparó `bottle_opened` ese día (desde el resumen diario, que no caduca): cuenta
**acciones**, no botellas (una acción puede tomar varias), y un bloqueador o `Do Not Track` las subcuenta. Las
bajas por admin de cuentas de prueba (`before.email` de un dominio excluido) no se cuentan. Una baja propia queda con
el mail enmascarado (`ju***@gmail.com`).

### Registro de actividad (`GET /admin/logs`) y autores

- `GET /admin/logs?page&limit&entityType&action&q&actor&from&to&actorRole`. `page`/`limit` inválidos (cero,
  texto, negativos) ya no dan 500: caen a `1` / `30` y el límite se acota a 100. `from`/`to` son `YYYY-MM-DD` en
  **calendario argentino** (`to` incluye el día entero); uno inválido se ignora. **Nuevo:** `actorRole=admin|user`
  separa los movimientos de un admin de los de una persona común editando lo suyo (los registros sin rol cuentan
  como admin; otro valor no filtra). Cada fila ya trae `actor.role`.
- `GET /admin/logs/actors` devuelve `{ data: ["mail", ...], details: [{ email, role }] }`. `data` es el contrato de
  siempre; **nuevo:** `details` trae el rol con el que actuó cada uno la última vez y `?role=admin|user` filtra
  ambas listas (la columna "Admin" listaba también a usuarios comunes porque el actor es quien edita).
- La baja de cuenta propia queda en el registro: `entityType: "user"`, `action: "delete"`,
  `actor: { userId, email: <enmascarado>, role }`, `before: { email: <enmascarado>, role, selfDelete: true }`.
  Las bajas hechas por un admin no llevan `selfDelete`.
- **Privacidad del registro (no caduca).** Cada movimiento de vino guarda `actor.email`/`actor.userId` mientras la
  cuenta existe. Al darse de baja (propia **o** por admin) esos registros pasan a `actor.email` enmascarado
  (`ju***@gmail.com`; con una parte local de 1 o 2 letras igual queda algo oculto: `***@x.com`, `a***@x.com`) y
  **sin** `actor.userId`. Los registros que otros dejaron *sobre* la cuenta (cambio de rol, baja) pierden el mail
  entero (`before.email`, `after.targetEmail` enmascarados), `before.firstName` y el `entityId` (queda uno suelto).
  Desde ahora, al cambiar un rol o borrar a un usuario el panel guarda el mail ya enmascarado y **no** guarda el
  nombre; el registro de la baja lleva un `entityId` nuevo (no el de la cuenta). Por eso `GET /admin/logs?q=` busca
  también el mail **entero** enmascarándolo antes de comparar (`q=juan.perez@gmail.com` encuentra `ju***@gmail.com`);
  el dominio suelto (`q=@gmail.com`) sigue funcionando. Si la anonimización falla, la baja se corta (la cuenta sigue
  viva) y se puede reintentar: es idempotente.
- `DELETE /admin/users/bulk` valida cada id (string con forma de ObjectId; sin repetidos): los inválidos y los que no
  son texto no llegan a la base y vuelven en `data.failed` (`"Id inválido"`). El tope de 100 cuenta lo recibido.
- `GET /admin/users`, `/admin/reviews` y `/admin/error-logs` usan la misma validación de `page`/`limit`
  (defaults 20, 20 y 30; máximo 100). `/admin/error-logs` usa también el calendario argentino en `from`/`to`.
