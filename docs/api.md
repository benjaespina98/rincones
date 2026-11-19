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

## Quiero probar (`/wishes`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` `POST` | `/wishes` | Listar y agregar |
| `PATCH` | `/wishes/:id` | Editar |
| `PATCH` | `/wishes/:id/convert` | Pasar a la bodega |
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
