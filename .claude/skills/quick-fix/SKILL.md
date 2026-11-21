---
name: quick-fix
description: Arreglo chico y acotado (un texto, un margen, un bug puntual) con verificación mínima y sin commitear. Usar cuando el cambio es trivial y no justifica el flujo completo.
argument-hint: "[qué arreglar]"
---
# Workflow: Quick fix

## Paso 1 — Ubicar
Buscá el punto exacto con Grep (`client/src`, `server/src`). Si toca `quantity`/`tasted`/`favorite`, lotes o pestañas de Mi Bodega, leé antes `reglas-de-negocio`; si es CSS o copy, `diseno-y-a11y`.

## Paso 2 — Cambiar lo mínimo
Sin refactors ni archivos de más. Colores sólo con tokens de `client/src/index.css`; copy rioplatense, de vos.

## Paso 3 — Verificar según lo tocado
- Client: `npm run lint -w client`, `npm run check:tokens -w client`, `npm test -w client` (o el test puntual con `npx vitest run <archivo>` desde `client/`).
- Server: `npm test -w server`.
- Algo visible: verificar con estilos computados en la app corriendo (`levantar-local`), no a ojo.

## Paso 4 — Cerrar
Decí qué cambió y cómo lo verificaste. No commitees: eso es `/preparar-commit`. Si el cambio resultó más grande de lo previsto, pasá a `new-feature`.

## Restricciones
Sin commit ni push. Nada contra la base `rincones`.
