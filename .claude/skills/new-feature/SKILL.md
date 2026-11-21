---
name: new-feature
description: Arranca una funcionalidad nueva en Rincones: lee el estado del rediseño, planifica por capas, implementa con tests y verifica. Usar para cambios que tocan más de un archivo o flujo.
argument-hint: "[descripción de la funcionalidad]"
---
# Workflow: Nueva funcionalidad

## Paso 1 — Contexto
Leé `docs/REDESIGN_PROGRESS.md` (fases, decisiones, próximo paso) y las skills del tema: `reglas-de-negocio` (vinos, stock, pestañas), `diseno-y-a11y` (UI), `gemini` (Sommelier/escáner), `mongo-y-migraciones` (modelos).

## Paso 2 — Plan por capas
Qué cambia en `server/` (route → controller → service → modelo), en `client/` (servicio en `client/src/services`, componentes, CSS con tokens) y en `docs/api.md` si cambia un contrato. Si es grande, pedile el plan a `einstein-backend` y/o `picasso-frontend`.

## Paso 3 — Implementar con tests
Rama: trabajá en la rama actual (`develop`, según tu flujo; el proyecto además admite feature → PR a `develop`, ver `publicar`). Tests nuevos junto al código (vitest en `client/`, `node --test` en `server/test/`). Los conteos de referencia de `CLAUDE.md` pueden subir, nunca bajar.

## Paso 4 — Verificar
```bash
npm run lint -w client && npm run check:tokens -w client && npm test -w client && npm test -w server && npm run build
```
Si hay UI, medir en la app corriendo (`/levantar-local`).

## Paso 5 — Cerrar
Resumen de lo hecho, números medidos y lo no verificado. Después: `/preparar-commit`.

## Restricciones
JavaScript (no TypeScript), CSS plano, sin colores literales fuera de `index.css`, íconos propios, copy rioplatense. Nada contra la base `rincones`.
