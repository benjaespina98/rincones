# Variables de entorno

Los valores de ejemplo están en [`server/.env.example`](../server/.env.example) y
[`client/.env.example`](../client/.env.example), con comentarios por variable. Los
archivos `.env` reales no se versionan.

## Las bases de datos

El cluster tiene dos bases del proyecto, y `MONGODB_DB_NAME` decide en cuál se
escribe:

| Base | Para qué |
|---|---|
| `rincones` | **Producción.** Datos reales. Sólo la usa el deploy |
| `test` | Desarrollo y pruebas locales. Es la que trae `.env.example` |

Dos cosas a tener presentes:

- `test` es también la base por defecto de Mongoose. Por eso
  `server/src/config/db.js` se niega a conectar sin `MONGODB_DB_NAME`, en vez de
  adivinar.
- Los scripts de migración no eligen base por su cuenta: usan el `.env` del
  directorio desde el que corren (ver [operations.md](operations.md)).

## Backend (`server/.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `MONGODB_URI` | Sí | Cadena de conexión a MongoDB |
| `MONGODB_DB_NAME` | Sí | Nombre de la base: `rincones` en producción, `test` en desarrollo |
| `JWT_SECRET` | Sí | Firma de los tokens de sesión |
| `FRONTEND_URL` | Sí | Origen del cliente (CORS y enlaces de los mails) |
| `PORT` | No | Puerto del servidor (4000 por defecto) |
| `CORS_ALLOWED_ORIGINS` | No | Orígenes permitidos, separados por coma |
| `CORS_ALLOW_VERCEL_PREVIEWS` | No | Permite los dominios de preview de Vercel |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Los usa `npm run seed:admin -w server` para crear la cuenta de administrador |
| `GEMINI_API_KEY` | No | Reconocimiento de etiquetas, fichas y Sommelier con IA |
| `GEMINI_MODEL` / `GEMINI_VISION_MODEL` | No | Fuerzan un modelo puntual. Conviene dejarlos vacíos |
| `CLOUDINARY_URL` | No | Almacenamiento de imágenes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | No | Envío de mails |
| `GOOGLE_CLIENT_ID` | No | "Continuar con Google" (mismo valor que `VITE_GOOGLE_CLIENT_ID`) |
| `ANALYTICS_SALT` | No | Sal del hash de visitantes |
| `ANALYTICS_EXCLUIR_ADMINS` | No | Por defecto las cuentas admin no cuentan en las métricas; `0` o `false` las vuelve a medir |
| `ANALYTICS_EXCLUIR_DOMINIOS` | No | Dominios de email de cuentas de prueba que no cuentan (por defecto `example.test`) |
| `ANALYTICS_MAX_VISITANTES_DIA` / `ANALYTICS_MAX_SESIONES_DIA` | No | Tope de visitantes (5000) y sesiones (20000) nuevos por día: pasado el tope no se suman más |
| `ANALYTICS_RESERVA_LOGUEADOS_DIA` | No | Cupo extra (5000) para eventos con sesión abierta: no los desplaza el tope de anónimos |
| `ANALYTICS_MAX_NUEVOS_POR_IP_DIA` | No | Visitantes nuevos que una misma IP puede sumar por día (20), contado en memoria por instancia |
| `ANALYTICS_LIMITE_IP` | No | Pedidos a `/api/analytics/collect` por IP cada 5 minutos (por defecto 100) |
| `COOKIE_DOMAIN` / `COOKIE_SAMESITE` | No | Sólo con frontend y backend en subdominios de un dominio propio |
| `SENTRY_DSN` / `SENTRY_RELEASE` | No | Monitoreo de errores |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Contadores de rate limiting compartidos entre instancias. Sin ellas, en memoria |

Las variables opcionales degradan sin romper la app (ver
[architecture.md](architecture.md)).

## Frontend (`client/.env`)

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL base de la API (`http://localhost:4000/api` en local) |
| `VITE_SITE_URL` | Dominio público para Open Graph y `canonical`. Sin definir usa `https://rincones.vercel.app` |
| `VITE_GOOGLE_CLIENT_ID` | "Continuar con Google". Sin esto el botón no se muestra |
| `VITE_SENTRY_DSN` / `VITE_SENTRY_RELEASE` | Monitoreo de errores del cliente |
| `VITE_CAFECITO_URL` | Enlace de "Invitame un café" en el perfil |
