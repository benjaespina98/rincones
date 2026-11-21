---
name: deploy-main
description: Segunda tanda del despliegue, sólo cuando la pedís. Abre el PR `develop` -> `main` tras revisión final de agentes y lo mergea con tu confirmación. El merge despliega producción en Vercel.
disable-model-invocation: true
---
# Workflow: Deploy main (tanda 2)

Producción tiene usuarios reales. `main` es la única rama protegida: sólo se llega por PR.

## Paso 1 — Precondiciones
```bash
git fetch origin
git branch --show-current                      # develop
git status --short                             # limpio
git rev-list --left-right --count develop...origin/develop   # 0 0 = sincronizados
git log origin/develop..origin/main --no-merges --oneline    # commits de main que develop no tiene
```
- Develop local y remoto desincronizados o con cambios pendientes → detenerse e indicar `/deploy-develop` primero.
- Si el último comando lista commits: avisar el riesgo de conflicto y **detenerse** sin resolver. Si no lista nada, lo que `main` tiene de más son sólo merge commits de PRs anteriores (el historial lo hace así): es esperable y se sigue.
- Si ya hay un PR `develop -> main` abierto (`gh pr list --base main --head develop`), usarlo en vez de crear otro.

## Paso 2 — Revisión final (paralelo, modo revisión, sobre `git diff origin/main...origin/develop`)
`messi-lead` y `cyber-security` siempre (pasales el diff en el prompt: no tienen Bash). Sumá `automata-devops` si el diff toca CI, `package*.json`, `vercel.json`, scripts o migraciones (`server/scripts/migrate*`), y `einstein-backend` si toca modelos o datos. Un hallazgo **crítico o alto** detiene todo y se muestra.
`CLAUDE.md` además pide `pirlo`, `houdini`, `fangio` y `sherlock` (recorrido completo) para producción: ver skill `publicar` parte B.

## Paso 3 — Crear el PR
`gh` está fuera del PATH y tropieza con `safe.directory`: ver skill `entorno-local`. En PowerShell, cuerpo con here-string:
```powershell
gh pr create --base main --head develop --title "<título>" --body-file <archivo con el cuerpo>
```
Cuerpo: resumen agrupado, lista de commits, riesgos y migraciones, tabla de verificación (lint, tokens, tests client/server, bundle) y veredicto por agente. Sin `gh`: dejar el comando y la URL `https://github.com/benjaespina98/rincones/compare/main...develop`. Pie del PR: línea de generación de Claude Code.

## Paso 4 — Confirmar el merge
Mostrar qué dispara: el CI (`Lint y tests`) corre sobre el PR; al mergear, push a `main` vuelve a correr el CI y **Vercel despliega producción** (client y API). Migraciones: no se corren solas; si el diff trae `migrate:*`, listarlas (TODO: confirmar a mano cómo se corren contra `rincones`, nunca desde acá). **Parar y pedir confirmación.** Sin un sí explícito en esta ejecución, no se mergea.

## Paso 5 — Merge y estado
Con CI verde y `MERGEABLE` (usar `ccd_pr get_status`, sin polling propio) y el sí del usuario:
```powershell
gh pr merge <N> --merge
```
Sin `--delete-branch` ni `--admin`. Después confirmar el deploy y que `https://rincones-api.vercel.app/api/health` responde `{"status":"ok","db":"up"}`; si no, avisar de inmediato.

## Restricciones
Nunca push directo a `main`, `--force` ni borrar ramas. No resolver conflictos por cuenta propia.
