# Despliegue

Frontend y backend se despliegan como **dos proyectos separados en Vercel**. La
rama `main` despliega producción.

| Pieza | Dónde | URL |
|---|---|---|
| Frontend (`client`) | Vercel | https://rincones.vercel.app |
| Backend (`server`) | Vercel (función serverless) | https://rincones-api.vercel.app |
| Base de datos | MongoDB Atlas | base `rincones` (producción) |

El frontend reenvía `/api/*` al backend con un rewrite de
[`client/vercel.json`](../client/vercel.json). El mismo archivo define las
cabeceras de seguridad y de caché.

## Pasos

1. **Base de datos.** Crear un cluster en MongoDB Atlas, un usuario y habilitar el
   acceso de red.
2. **Backend.** Desplegar la carpeta `server`. Entra por
   [`server/api/index.js`](../server/api/index.js) y se enruta con
   [`server/vercel.json`](../server/vercel.json). Cargar las variables de entorno
   (ver [environment.md](environment.md)), con `MONGODB_DB_NAME=rincones`.
3. **Frontend.** Desplegar `client` con `VITE_API_URL` apuntando a la API. Las
   rutas de React Router las resuelve el rewrite de `client/vercel.json`.

El backend comprueba su estado en `GET /api/health`, que responde
`{"status":"ok","db":"up"}`.

## Flujo de ramas

`feature` → pull request a `develop` → `develop` → `main`. La integración continua
(`.github/workflows/ci.yml`) corre en cada PR a `develop` o `main` y en cada push a
`main`.

## Dominio propio

La app está preparada para un dominio propio. Al tenerlo:

| Dónde | Qué cambiar |
|---|---|
| `CORS_ALLOWED_ORIGINS` (backend) | Agregar el dominio del frontend |
| `VITE_SITE_URL` (frontend, en Vercel) | El dominio público. Sin esto, Open Graph y el `canonical` de `index.html` apuntan a `rincones.vercel.app` |
| `client/vercel.json`, `rewrites` | El destino de `/api/:path*` está fijo al dominio actual del backend. Vercel no interpola variables ahí, así que es una edición manual |
| `COOKIE_DOMAIN` (backend, opcional) | Sólo si frontend y backend viven en subdominios del mismo dominio (`app.` y `api.`) |
| `FRONTEND_URL` (backend) | Se usa en los enlaces de los mails de recuperación de contraseña |
| Google Cloud Console | Cargar el origen y el callback `/auth/google/callback` del dominio nuevo (ver `server/.env.example`) |

## Backups y monitoreo

Ver [operations.md](operations.md).
