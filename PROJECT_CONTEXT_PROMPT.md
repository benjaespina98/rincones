# Contexto del proyecto: Rincones

## Qué es

Rincones es una aplicación web MERN para escanear, coleccionar y organizar vinos. El usuario saca una foto de la etiqueta, el sistema extrae los datos por OCR, y el vino queda guardado en su "bodega" personal junto con estadísticas, favoritos y "momentos" de degustación (cuándo, con quién, qué comió, qué le pareció).

## Objetivo

Ser la app personal de un coleccionista/aficionado al vino: registrar qué vinos tiene en stock, cuáles ya probó, llevar un historial de momentos de consumo, ver estadísticas (por tipo, varietal, región, rating promedio) y recibir sugerencias dentro de su propia colección.

## Stack técnico

- **Backend**: Node.js + Express 5, MongoDB + Mongoose, JWT + cookies httpOnly para auth, bcryptjs, Tesseract.js (OCR de etiquetas), multer (subida de imágenes), nodemailer (emails de recuperación de contraseña), helmet + express-rate-limit (seguridad).
- **Frontend**: React 19 + Vite, React Router v7, Axios, Context API (Auth, Toast).
- **Estructura backend**: patrón Route → Controller → Service → Model (parcialmente aplicado; `wines` ya tiene la capa de service completa, otros módulos son más directos).
- **Tests**: `node --test` en el backend, Vitest + Testing Library en el frontend.
- **Deploy objetivo**: Vercel (frontend y backend como proyectos separados), MongoDB Atlas en producción.

## Modelo de datos principal (`Wine`)

Cada vino tiene: nombre, bodega, año, región, varietal, tipo (red/white/rosé/sparkling/fortified), rating, cantidad en stock, estado (`stock` | `tasted` | `archived`), favorito, descripción (cuerpo, aromas, maridajes, alcohol), imagen, texto crudo de OCR, y un array de `moments` (degustaciones con fecha, ocasión, acompañantes, lugar, emoción, notas, foto, tags). Hay agregaciones para stats por usuario (conteos por tipo, top varietales/regiones, rating promedio).

## Funcionalidades actuales (rutas del cliente)

- `/` y `/favoritos` — Mi Bodega (colección del usuario, con filtro de favoritos)
- `/explorar` — Sugerencias dentro de la colección
- `/descubrir` — Escanear etiqueta de vino (OCR) y agregarlo
- `/perfil` — Perfil de usuario
- `/login`, `/register`, `/forgot-password`, `/reset-password` — auth
- `/admin` — panel de administración (roles de usuario, logs de auditoría)

## API REST (`/api`)

- `/auth` — register, login, me, logout, forgot/reset password (cookies httpOnly, sin localStorage)
- `/wines` — CRUD de vinos, búsqueda, stats, ajuste de stock, momentos de degustación
- `/labels/analyze` — sube una foto de etiqueta y devuelve datos extraídos por OCR
- `/users` — perfil, password, stats, wine-stats
- `/admin` — logs de cambios, gestión de usuarios/roles (requiere rol admin)

## Estado actual (junio 2026)

- App funcional y enfocada 100% en vinos. Hasta hace poco coexistía con una feature vestigial de un proyecto anterior ("Rincones" original: descubrir lugares turísticos/bodegas en un mapa, con Mapbox/Leaflet, Foursquare, OpenStreetMap, Wikipedia y reranking por IA). Esa feature completa (rutas, páginas, componentes, contexto, servicios, modelos y endpoints de backend) fue eliminada recientemente para que el código solo hable de vinos.
- Auth unificado a cookies httpOnly (se sacó el esquema dual con localStorage).
- Validación de variables de entorno al arranque del servidor (falla rápido si falta `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`).
- Tests backend (6) y frontend (3) pasando.
- README actualizado y reescrito para reflejar la app de vinos real.

## Pendiente / próximos pasos conocidos

- Cola asíncrona para el OCR (actualmente síncrono con Tesseract.js, puede colgarse en imágenes grandes; ideal sería BullMQ + Redis si escala el uso).
- Más cobertura de tests (E2E con Playwright).
- Logging/monitoring estructurado (Winston).
- CI/CD (GitHub Actions: test + lint + build).
- Rate limiting por usuario en endpoints costosos (ej. OCR).
- Hay documentos históricos (`CHANGES.md`, `PERMISOS.md`, `IMPROVEMENTS_SUMMARY_2026.md`) que todavía describen la versión vieja con lugares/mapa — son de referencia histórica, no reflejan el código actual.
