---
name: documentacion
description: Mantiene la documentación de `docs/` y los README de Rincones alineados con el código. Usar tras cambiar una API, una variable de entorno, el despliegue o el estado del rediseño.
argument-hint: "[tema o archivo de docs]"
---
# Workflow: Documentación

## Paso 1 — Qué doc corresponde
| Cambió… | Actualizar |
|---|---|
| un endpoint o su respuesta | `docs/api.md` |
| arquitectura o capas | `docs/architecture.md` |
| una variable de entorno | `docs/environment.md` y el `.env.example` correspondiente (sin valores reales) |
| despliegue, Vercel, dominio | `docs/deployment.md` |
| backups, monitoreo, operación | `docs/operations.md` |
| una fase del rediseño | `docs/REDESIGN_PROGRESS.md` (decisión + porqué + próximo paso) |
| algo visible para quien llega al repo | `README.md` y `README.es.md` (mantenerlos parejos) |

## Paso 2 — Verificar contra el código
Cada ruta, comando, variable y número que escribas tiene que estar comprobado (Grep, `package.json`, correr el comando). Los conteos de tests viven en `CLAUDE.md` y `skills/cicd`: actualizarlos juntos y sólo con números medidos.

## Paso 3 — Estilo
Español rioplatense, de vos. Explicá el porqué, no lo que ya se ve en el código. Sin relleno.

## Restricciones
No inventar datos. No incluir secretos ni capturas con datos reales de usuarios.
