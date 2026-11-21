---
name: preparar-commit
description: Prepara y deja hecho el commit en `develop` (o en la rama de trabajo actual) tras revisión en paralelo de agentes y verificaciones reales. Nunca hace push.
disable-model-invocation: true
---
# Workflow: Preparar commit

## Paso 1 — Precondiciones
```bash
git branch --show-current && git status --short
```
- Rama `main` → **detenerse** y avisar (no se commitea en `main`).
- Rama distinta de `develop` (por ejemplo una feature) → trabajar ahí sin cambiar de rama e informarlo.
- Sin cambios pendientes → informar y terminar.

## Paso 2 — Revisión con agentes (en paralelo, MODO REVISIÓN: sólo leen y reportan)
Un solo mensaje con varias llamadas Agent. Como `messi-lead` y `cyber-security` no tienen Bash, pasales en el prompt el resultado de `git diff` (y `git diff --cached`) y la lista de archivos.

| Siempre | Si el diff toca… |
|---|---|
| `messi-lead` · `cyber-security` | `server/` o modelos → `einstein-backend` |
| | `client/` (JSX/CSS) → `picasso-frontend` |
| | `.github/`, `.claude/`, `package*.json`, `vercel.json`, scripts → `automata-devops` |

Cada uno devuelve hallazgos por severidad (crítico, alto, medio, bajo) con archivo y línea. Indicale a cada uno: "modo revisión: no modifiques archivos".
Los agentes específicos del proyecto (`pirlo` tests, `messi` negocio, `tesla` Gemini, `picasso` visual) se suman si el diff lo pide, como indica `CLAUDE.md`.

## Paso 3 — Consolidar
Resumen corto. Si hay algo **crítico o alto** (secretos, vulnerabilidad seria, build roto, regresión evidente): **NO commitear**; mostrar los hallazgos y esperar la decisión del usuario. Medios y bajos se informan y se sigue.

## Paso 4 — Verificaciones reales
```bash
npm run lint -w client && npm run check:tokens -w client && npm test -w client && npm test -w server && npm run build && node client/scripts/check-bundle.cjs && npm audit --omit=dev --audit-level=high
```
Los conteos de tests no pueden bajar de la referencia de `CLAUDE.md`. Si algo falla, frenar.

## Paso 5 — Commit
- Mensaje en español, `tipo: descripción` (`feat`/`fix`/`docs`/`refactor`/`chore`), explicando el porqué (convención del historial).
- `git add` con **archivos concretos**; nunca `git add .` ni `-A`, nunca `.env*`, dumps ni `node_modules`.
- Identidad y `safe.directory`: ver skill `entorno-local`.
- Terminar el mensaje con la línea de coautoría que corresponda.
- Nunca `push`, `--amend` ni `--no-verify`.

## Restricciones
Sin push. Sin cambiar de rama. Si un hook bloquea algo legítimo, no esquivarlo: avisar.
