---
name: debug-api
description: Diagnostica un endpoint del server de Rincones (Express 5): reproduce, sigue route -> controller -> service -> modelo y propone el arreglo. Usar ante un 4xx/5xx o una respuesta rara de `/api/...`.
argument-hint: "[método y ruta, ej. GET /api/wines]"
---
# Workflow: Debug de API

## Paso 1 — Entender el contrato
Buscá el endpoint en `docs/api.md` y en `server/src/routes/` (admin, analytics, auth, catalog, labels, promotions, sommelier, users, wines, wishes). Anotá middlewares (auth, rate limit) y el controller.

## Paso 2 — Reproducir
Con el entorno levantado (`/levantar-local`, server en `http://localhost:4000`, base `test`). Para endpoints con auth, usá el usuario de `server/.env.qa-usuario` leyéndolo del archivo; no pegues credenciales en el chat. Capturá status, cuerpo y log del server. Health: `GET /api/health`.

## Paso 3 — Seguir el dato
`routes → controllers → services → models`: Read/Grep en cada capa. Revisá validaciones, filtro por `userId`, forma de `lots[]` y la invariante `quantity` = suma de `remaining`. Si interviene Gemini, skill `gemini`.

## Paso 4 — Probar la hipótesis
Un test que falle primero (`node --test`, en `server/test/`) y luego el arreglo. `npm test -w server`.

## Paso 5 — Reportar
Causa raíz con `archivo:línea`, arreglo, y cómo lo mediste. Pedí `einstein-backend` si el cambio es de modelo de datos.

## Restricciones
Nunca contra la base `rincones` ni contra `https://rincones-api.vercel.app` con escrituras. No imprimir secretos.
