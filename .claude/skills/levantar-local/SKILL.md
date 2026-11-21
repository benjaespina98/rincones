---
name: levantar-local
description: Levanta el entorno local de Rincones (server en el puerto 4000 + client Vite en 5173) tras verificar que apunta a la base `test`. Con el argumento `detener` para lo que levantó.
argument-hint: "[detener]"
---
# Workflow: Levantar entorno local

No hay Docker ni compose en el repo: MongoDB es externo (`MONGODB_URI` en `server/.env`) y la base de desarrollo es `test`. Nunca leas ni muestres valores de `.env`.

## Si el argumento es `detener`
Detené lo que arrancaste en esta sesión: `preview_stop` para el client (ver `preview_list`) y detené el proceso del server (el que arrancaste en background, puerto 4000). No toques procesos que no levantaste vos. Confirmá con `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health` que ya no responde. Terminá acá.

## Paso 1 — Verificar que es entorno local
```bash
node .claude/skills/levantar-local/verificar-entorno.cjs
```
Imprime sólo un veredicto, sin valores. Si sale con `ABORTAR` (base distinta de `test`, `NODE_ENV=production`, `VITE_API_URL` remota, falta `server/.env`): **no arranques nada** y mostrale el motivo al usuario. Un `AVISO` (host Mongo remoto) se informa y se sigue: el cluster puede compartirse con producción y sólo lo separa el nombre de base. TODO: confirmar con el usuario si el cluster de desarrollo es distinto del de producción.

## Paso 2 — Server (puerto 4000, aparte)
El harness del preview exporta `PORT=5173` y el server lo hereda y choca con Vite (ver skill `entorno-local`). Por eso va con puerto explícito y en background:
```bash
PORT=4000 npm run dev -w server
```
Esperá a ver `MongoDB conectado (test)` en el log (si dice otra base, detenelo y avisá) y a que `GET http://localhost:4000/api/health` dé `{"status":"ok","db":"up"}`.

## Paso 3 — Client (5173)
`preview_start` con `{name: "client"}` (definido en `.claude/launch.json`). Alternativa en terminal: `npm run dev -w client`. No uses `npm run dev` de la raíz si el harness define `PORT`.

## Paso 4 — Reportar
URL del client (http://localhost:5173), del server (http://localhost:4000), estado del health y cómo detener (`/levantar-local detener`). Usuario de prueba: `server/.env.qa-usuario` (leerlo del archivo, no pegarlo en el chat).

## Restricciones
- Nunca scripts ni migraciones contra la base `rincones`.
- Nunca imprimir contenido de `.env*`.
- Sin backend sólo se pueden ver `/styleguide`, `/login` y `/register`.
