# Rincones

Aplicacion web MERN para recomendar lugares para visitar (rios, montanas, bares, cafeterias, restaurantes, miradores y puntos turisticos), pensada para escalar a multiples ciudades.

## Stack

- MongoDB + Mongoose
- Express + Node.js
- React + Vite
- React Router + Axios
- Leaflet (mapa)
- Mapbox GL JS (mapa interactivo)
- Foursquare Places API (lugares cercanos)
- OpenStreetMap (Overpass + Nominatim)
- Wikipedia API (lugares y contexto publico)
- Google Places API (enriquecimiento opcional, requiere billing)

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

Estructura recomendada para escalar el modulo de mapa:

```
client/src/
	components/
		PlacesMapView.jsx
		PlacesBottomSheet.jsx
	pages/
		PlacesMapPage.jsx
	services/
		placesApi.js
	utils/
		mapPlaceCategories.js
server/src/
	controllers/
		places.controller.js
	models/
		placeCache.model.js
	routes/
		places.routes.js
	services/
		places.service.js
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
FOURSQUARE_API_KEY=your_foursquare_api_key
PLACES_CACHE_TTL_MINUTES=60
NOMINATIM_TIMEOUT_MS=7000
OVERPASS_TIMEOUT_MS=6500
WIKIPEDIA_TIMEOUT_MS=4500
GOOGLE_PLACES_ENABLED=false
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACES_TIMEOUT_MS=7000
AI_RERANK_API_KEY=
AI_RERANK_BASE_URL=https://openrouter.ai/api/v1
AI_RERANK_MODEL=openai/gpt-4o-mini
AI_CHAT_MODEL=openai/gpt-4o-mini
```

Frontend ([client/.env.example](client/.env.example)):

```
VITE_API_URL=http://localhost:4000/api
VITE_MAPBOX_TOKEN=your_mapbox_public_token
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
- `GET /places?lat=...&lng=...&radius=...&category=...` lugares cercanos desde cache/Foursquare
- `GET /geocode/discover?q=...&zona=...&categoria=...` busqueda inteligente multi-fuente
- `POST /lugares` crear un lugar
- `PUT /lugares/:id` actualizar un lugar
- `DELETE /lugares/:id` eliminar un lugar

Objeto devuelto por `GET /places`:

```json
{
	"id": "4b7d5e0ff964a52047c72fe3",
	"name": "Cafe Example",
	"category": "cafeteria",
	"latitude": -34.6037,
	"longitude": -58.3816,
	"address": "Av. Corrientes 1234, Buenos Aires, Argentina",
	"rating": 8.7,
	"distance": 245,
	"source": "foursquare"
}
```

Health check:

- `GET /health`

## Busqueda Inteligente (Gratis + Legal)

`/geocode/discover` combina multiples fuentes publicas:

- Comunidad Rincones (contenido propio)
- OpenStreetMap Overpass (POIs)
- OpenStreetMap Nominatim (fallback)
- Wikipedia (geosearch + extractos)

Modo hibrido opcional:

- Si `GOOGLE_PLACES_ENABLED=true` y definis `GOOGLE_PLACES_API_KEY`, se agrega Google Places como fuente de enriquecimiento.
- Si no hay key o billing, el sistema sigue funcionando con fuentes gratuitas.

El ranking prioriza:

- relevancia semantica por consulta
- cercania geografica
- calidad de datos (foto, web, contacto)
- deduplicacion entre fuentes

Reranking con IA real (opcional):

- Si configuras `AI_RERANK_API_KEY`, el backend reranquea resultados con el modelo configurado.
- Si no configuras esa clave, sigue funcionando con ranking heuristico local.

Chat IA en Descubrir (opcional):

- El endpoint `POST /geocode/chat` usa `AI_CHAT_MODEL` + `AI_RERANK_API_KEY` para responder con IA real.
- Sin esas credenciales, responde con asistente heuristico (fallback) usando los mejores lugares encontrados.

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

Mapa de lugares: http://localhost:5173/mapa

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