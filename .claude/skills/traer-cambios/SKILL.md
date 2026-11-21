---
name: traer-cambios
description: OPCIONAL. Trae del remoto lo nuevo con `fetch` y `pull --ff-only`, sin mezclar ni reescribir historial. Usar sólo al trabajar desde otra máquina o con más gente.
disable-model-invocation: true
---
# Workflow: Traer cambios (opcional)

## Paso 1 — Estado
```bash
git branch --show-current && git status --short
git fetch origin
```
Con cambios sin commitear, avisá antes de seguir (el pull puede negarse).

## Paso 2 — Qué hay de nuevo
```bash
git log HEAD..origin/<rama-actual> --oneline
git rev-list --left-right --count HEAD...origin/<rama-actual>
```

## Paso 3 — Traer sólo si es seguro
Si lo local no tiene commits propios que el remoto no tenga (segundo número > 0 y primero = 0):
```bash
git pull --ff-only origin <rama-actual>
```
Si hay divergencia (ambos números > 0) o el pull no es fast-forward: **detenerse** e informar. No hacer merge, rebase ni reset por cuenta propia.

## Paso 4 — Reportar
Commits traídos y si hay que reinstalar dependencias (`package-lock.json` cambió → `npm ci`).

## Restricciones
Nunca `git pull` sin `--ff-only`, `merge`, `rebase`, `reset --hard` ni `--force`. No cambiar de rama.
