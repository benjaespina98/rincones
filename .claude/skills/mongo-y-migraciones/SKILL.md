---
name: mongo-y-migraciones
description: Reglas de bases de datos de Rincones: separación test/producción, trampa de los índices TTL y migraciones. Usar al tocar modelos, índices o scripts de server/scripts.
---

# Mongo y migraciones

## Bases
`server/src/config/db.js` separa: **`rincones` = PRODUCCIÓN**, **`test` = desarrollo**. **Nunca** correr scripts ni migraciones contra producción. Antes de ejecutar un script de `server/scripts/`, confirmar a qué base apunta la URI activa.

## Trampa del TTL
Cambiar el plazo de un índice TTL no alcanza: Mongoose rechaza redefinirlo con otras opciones (`IndexOptionsConflict`), el viejo sigue vigente y el schema nuevo no hace nada. `collMod` no está permitido para el usuario de la base.
Solución: un índice sobre **OTRO campo** (así lo hace `SommelierConversation`: 45 días sobre `updatedAt`, no sobre `createdAt`). El viejo queda inofensivo. Probar siempre contra `test`, que tiene los índices viejos y replica el despliegue.

## Migraciones
- Scripts `migrate:*` en `server/package.json`. Hacerlas **aditivas**: los documentos viejos siguen siendo válidos y todo lector cae a un default.
- Todos corren en **simulacro por defecto** (`server/scripts/lib/modoMigracion.js`): sin `--aplicar` no escriben. Aplicar sobre `rincones` exige además `--confirmo-destino=rincones`.
- Idempotentes: correrlas dos veces no rompe nada.
- Backups: `npm run backup:drill -w server` ensaya el restore.
