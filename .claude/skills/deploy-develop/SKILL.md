---
name: deploy-develop
description: Primera tanda del despliegue. Commitea lo pendiente (con /preparar-commit) y sube `develop` al remoto con tu confirmación. No crea el PR a main.
disable-model-invocation: true
---
# Workflow: Deploy develop (tanda 1)

## Paso 1 — Commit pendiente
`git status --short`. Si hay cambios sin commitear, ejecutá **completo** el flujo de `preparar-commit` (incluye la revisión con agentes) y recién después seguí. Si ya está todo commiteado, saltealo.

## Paso 2 — Verificar
```bash
git branch --show-current          # debe ser develop
git status --short                 # árbol limpio
npm run lint -w client && npm run check:tokens -w client && npm test -w client && npm test -w server && npm run build && node client/scripts/check-bundle.cjs && npm audit --omit=dev --audit-level=high
git diff origin/develop..HEAD      # buscar secretos (claves, tokens, .env) en lo que sube
git fetch origin
git log HEAD..origin/develop --oneline
```
- Rama distinta de `develop` → detenerse y avisar (esta skill sube `develop`).
- Si `origin/develop` tiene commits que no tengo: **detenerse** e informar, sin mezclar ni reescribir nada.
- Build o tests en rojo, o secretos en el diff → detenerse.

## Paso 3 — Mostrar y confirmar
Listá `git log origin/develop..HEAD --oneline` y lo que dispara el push: **no corre el CI** (`ci.yml` se dispara en PR a `develop`/`main` y en push a `main`), pero Vercel puede generar un deploy de preview de la rama. TODO: confirmar en Vercel si hay previews para `develop`. Pedí confirmación explícita.

## Paso 4 — Push
Con el sí del usuario: `git push origin develop` (el hook `git-guard` también pide confirmación). Sin `--force`.

## Paso 5 — Terminar
Reportar commits subidos. **No** crear el PR a `main` ni seguir con `deploy-main`: eso es otra tanda que el usuario pide aparte.

## Restricciones
Nunca push a `main`, `--force`, `--no-verify` ni `--amend`. Sin cambiar de rama.
