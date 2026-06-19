# Rincones

Aplicacion web MERN para escanear, coleccionar y organizar vinos: tu bodega personal, momentos de degustacion y sugerencias.

## Stack

- MongoDB + Mongoose
- Express + Node.js
- React + Vite
- React Router + Axios
- Tesseract.js (OCR de etiquetas de vino)
- Unsplash API (imagenes de vinos, opcional)

## Estructura

```
client/
	src/
		components/
		pages/
		utils/
		services/
		hooks/
		context/
server/
	src/
		controllers/
		models/
		routes/
		middleware/
		services/
		app.js
```

## Requisitos

- Node.js 20+
- MongoDB local o remoto

## Variables de entorno

Backend ([server/.env.example](server/.env.example)):

```
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/rincones
MONGODB_DB_NAME=rincones
JWT_SECRET=change_this_super_secret
FRONTEND_URL=http://localhost:5173
ADMIN_EMAIL=admin@rincones.local
ADMIN_PASSWORD=change_this_password
CORS_ALLOWED_ORIGINS=http://localhost:5173
CORS_ALLOW_VERCEL_PREVIEWS=false
```

Frontend ([client/.env.example](client/.env.example)):

```
VITE_API_URL=http://localhost:4000/api
VITE_UNSPLASH_API_KEY=your_unsplash_api_key
```

## Instalacion

```bash
npm install
```

## Desarrollo

Inicia frontend y backend en paralelo:

```bash
npm run dev
```

Comandos utiles:

```bash
npm run dev:server
npm run dev:client
npm run build
```

## API REST

Base URL: `http://localhost:4000/api`

Auth (`/auth`):

- `POST /auth/register` registrar usuario
- `POST /auth/login` iniciar sesion (cookie httpOnly)
- `GET /auth/me` usuario autenticado
- `POST /auth/logout` cerrar sesion
- `POST /auth/forgot-password` / `POST /auth/reset-password`

Vinos (`/wines`):

- `GET /wines` listar coleccion del usuario
- `GET /wines/search` buscar dentro de la coleccion
- `GET /wines/stats/summary` resumen de estadisticas
- `GET /wines/:id` detalle de un vino
- `POST /wines` agregar vino
- `PUT /wines/:id` actualizar vino
- `PATCH /wines/:id/stock` ajustar stock
- `GET /wines/:id/moments` / `POST /wines/:id/moments` momentos de degustacion
- `DELETE /wines/:id` eliminar vino

Etiquetas (`/labels`):

- `POST /labels/analyze` analiza una foto de etiqueta (OCR) y extrae datos del vino

Usuarios (`/users`):

- `GET /users/profile` / `PUT /users/profile`
- `PUT /users/password`
- `GET /users/stats`
- `GET /users/:id/wine-stats`

Admin (`/admin`, requiere rol admin):

- `GET /admin/logs` historial de cambios
- `GET /admin/users` / `PUT /admin/users/:userId/role`

Health check:

- `GET /health`

## Despliegue (Vercel)

- Frontend: desplegar carpeta `client`
- Backend: desplegar carpeta `server` y usar [server/vercel.json](server/vercel.json)

## Levantar En Local (Listo)

Ya estan creados los archivos:

- [server/.env](server/.env)
- [client/.env](client/.env)

Ejecutar:

```bash
npm install
npm run dev
```

Frontend local: http://localhost:5173

Backend local: http://localhost:4000/api

## Atlas + Vercel (Siguiente Paso)

1. Crear cluster en MongoDB Atlas.
2. Crear usuario de base de datos.
3. Habilitar acceso de red para tu IP o 0.0.0.0/0 en pruebas.
4. Copiar connection string de Atlas y reemplazar `MONGODB_URI`.
5. En Vercel (proyecto backend `server`), crear variables de entorno `MONGODB_URI` y `MONGODB_DB_NAME` (ejemplo: `rincones`).
6. En Vercel (proyecto frontend `client`), crear variable `VITE_API_URL` apuntando al dominio del backend, por ejemplo: `https://tu-back.vercel.app/api`.
7. Redeploy de ambos proyectos.

Notas:

- El backend para Vercel entra por [server/api/index.js](server/api/index.js).
- React Router en Vercel se resuelve con [client/vercel.json](client/vercel.json).
