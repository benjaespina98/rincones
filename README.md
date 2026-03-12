# Rincones

Aplicacion web MERN para recomendar lugares para visitar (rios, montanas, bares, cafeterias, restaurantes, miradores y puntos turisticos), pensada para escalar a multiples ciudades.

## Stack

- MongoDB + Mongoose
- Express + Node.js
- React + Vite
- React Router + Axios
- Leaflet (mapa)

## Estructura

```
client/
	src/
		components/
		pages/
		services/
		hooks/
		context/
		utils/
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
```

Frontend ([client/.env.example](client/.env.example)):

```
VITE_API_URL=http://localhost:4000/api
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

- `GET /lugares` obtener todos los lugares
- `GET /lugares/:id` obtener detalle de un lugar
- `POST /lugares` crear un lugar
- `PUT /lugares/:id` actualizar un lugar
- `DELETE /lugares/:id` eliminar un lugar

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