# POLISH_REPORT

Rama: `chore/polish-2026-09-24`. Sin push ni merge. Todo contra `MONGODB_DB_NAME=test`; nunca se tocó `rincones`.

## Línea base
- Server 336 tests, client 214 tests, lint limpio, build OK.
- Bundle: `index` 482.7 kB (160 kB gzip) + `index` 226.6 kB (72 kB gzip) + vendor 98 kB (36 kB gzip).
- `npm audit`: 5 vulnerabilidades (3 moderadas: `@humanfs/node`, `@vitest/mocker` y otra; 2 altas: `nodemailer <=9.1.0`, `js-yaml 4.0.0–4.3.1`).

## (a) Cambios
**Seguridad backend.** La auditoría dirigida (greps) encontró que ya estaba resuelto: rotación de refresh tokens con detección de reutilización (`session.service.js`, hash en base), cookies `httpOnly` + `secure` + `sameSite` configurable, rate limit en login/registro/forgot/reenvío/Google, `express.json` con tope de 12 MB, multer con 8 MB y filtro de imágenes, emails coercionados con `String()` (sin operadores NoSQL), test `routeAuth` que exige `authenticate` en cada ruta. No se cambió nada ahí.
**Costos de IA.** Nuevo `aiDailyLimiter` (150/día por usuario) en `/api/labels/analyze` y `/api/catalog/*`, además del de 60/hora. Al llegar, responde 429 en JSON con mensaje que sugiere cargar a mano.
**Health.** `/api/health` ahora devuelve `{status, db}` (200 con base conectada, 503 si no). Sin versiones ni hosts.
**Baja de cuenta.** `DELETE /api/users/me`: exige escribir el email (y la contraseña si la cuenta la tiene), borra vinos, deseos, momentos, reseñas, precios, eventos de analítica y sesiones, y la cuenta al final. El único admin no puede darse de baja. Servicio en `accountDeletion.service.js`, con 3 tests.

## (c) Métricas
Server: 336 → 339 tests, todos pasan. Client: sin cambios (no se corrió de nuevo, no se tocó). Bundle sin cambios.

## (b) Decisiones
- Borrado de cuenta sin transacción: si falla a mitad de camino, la cuenta sigue viva y se reintenta; evita duplicar el fallback de transacciones de admin.
- Health devuelve 503 si Mongo no está conectado, para que un monitor lo detecte.

## (d) No hecho
- `npm audit fix` falló por un bug de npm (`Cannot read properties of null (reading 'edgesOut')`). No se forzó.
- Nada de client/UI para la baja de cuenta (el endpoint está, falta el botón).
- Todo el resto del alcance original, por acuerdo de consumo.

## (e) Pendientes por impacto
1. Resolver `npm audit`: actualizar `nodemailer` (altas: bypass de dominio en destinatarios) y `js-yaml`; probar en una rama aparte por el bug de npm (borrar `node_modules` y reintentar, o subir versiones a mano).
2. Botón "Eliminar mi cuenta" en Perfil con confirmación de email (y contraseña) que llame a `DELETE /api/users/me`.
3. Política de privacidad y términos (datos: email, nombre, fecha de nacimiento, fotos, analítica con `userId`, Gemini/Cloudinary/Brevo como terceros) y links en registro y footer.
4. Checklist de producción en README: backups + drill, dominio propio, `SENTRY_DSN` y `VITE_SENTRY_DSN`, `JWT_SECRET` largo, `ANALYTICS_SALT`, `CORS_ALLOWED_ORIGINS`, `MONGODB_DB_NAME=rincones` sólo en Vercel, monitor sobre `/api/health`.
5. Índices vs consultas reales con `explain` (sobre `test`), en `Wine`, `WineWish`, `AnalyticsEvent`.
6. Accesibilidad móvil: foco visible, tamaños táctiles (≥44px), contraste, lectores de pantalla; revisar estado vacío del primer uso.
7. SEO/compartir en landing e informe de anunciantes: `<title>`, description, Open Graph por página, `robots`/sitemap.
8. Bundle: `index` de 482 kB sigue siendo grande; revisar qué entra al chunk principal.
9. Backup drill: revisar restauración a base descartable y verificación de conteos.
