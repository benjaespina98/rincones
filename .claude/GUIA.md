# Guía de uso de Claude Code en Rincones

Guía corta para vos. El manual completo del proyecto (comandos `/revisar-*`, `/publicar`) sigue en [`README.md`](README.md); esta guía es el flujo diario.

## 1. Qué es cada cosa
- **Agentes**: especialistas que revisan o hacen una tarea acotada. Se los pedís por nombre ("usá el agente `einstein-backend` para revisar este endpoint") o los lanzan las skills.
- **Skills / comandos**: flujos que se ejecutan con `/nombre` (`/preparar-commit`, `/deploy-develop`…).
- **Hooks**: guardas automáticas antes de cada comando. Bloquean (exit 2) o piden confirmación.
- **Permisos**: lo que Claude puede hacer solo (`allow`), lo que pregunta (`ask`) y lo que nunca puede (`deny`), en `.claude/settings.json`.

## 2. Agentes
| Agente | Para qué | Cuándo | Ejemplo de pedido |
|---|---|---|---|
| `messi-lead` | QA e impacto cruzado client↔server, reglas duras | Antes de commitear, siempre | "usá `messi-lead` para revisar el impacto de este cambio de lotes" |
| `einstein-backend` | Endpoints, modelos Mongoose, auth, Gemini en server | Tocás `server/` | "usá `einstein-backend` para revisar `wines.routes.js`" |
| `picasso-frontend` | Componentes, CSS con tokens, responsive, a11y | Tocás `client/` | "usá `picasso-frontend` para armar esta vista" |
| `cyber-security` | Auditoría de seguridad (sólo lectura) | Antes de commitear, siempre | "usá `cyber-security` sobre el diff" |
| `automata-devops` | CI, hooks, ramas, Vercel, bundle | Tocás `.github/`, `.claude/`, deps | "usá `automata-devops` para revisar `ci.yml`" |

Del proyecto, conservados: `messi` (negocio del vino), `picasso` (visual), `pirlo` (tests), `houdini` (seguridad), `tesla` (Gemini), `fangio` (CI/bundle), `sherlock` (QA en la app corriendo). `CLAUDE.md` pide lanzarlos solos según el diff.
No hay `mark-seo` ni `arquitect-infra`: la app es un PWA con login y la infra es Vercel + Atlas, sin Docker/Terraform propios.

## 3. Skills / comandos
| Comando | Qué hace | Cuándo | Agentes que ejecuta |
|---|---|---|---|
| `/levantar-local` | Verifica entorno `test`, levanta server (4000) y client (5173). `detener` los baja | Empezar a trabajar | ninguno |
| `/preparar-commit` | Revisa, verifica y commitea en `develop` (sin push) | Terminaste un cambio | `messi-lead`, `cyber-security` + `einstein-backend`/`picasso-frontend`/`automata-devops` según diff |
| `/deploy-develop` | Commitea si falta y sube `develop` (tanda 1) | Querés `develop` en el remoto | los de `preparar-commit` |
| `/deploy-main` | PR `develop → main` y merge con tu OK (tanda 2) | Querés producción; lo pedís aparte | `messi-lead`, `cyber-security` + `automata-devops`/`einstein-backend` si aplica |
| `/traer-cambios` | `fetch` + `pull --ff-only` (opcional) | Otra máquina o más gente | ninguno |
| `/quick-fix`, `/new-feature`, `/debug-api`, `/documentacion` | Flujos de trabajo según el tipo de tarea | Al arrancar la tarea | opcional |

Siguen vigentes los propios: `/revisar`, `/revisar-ui|negocio|seguridad|tests|ia|build`, `/probar-app`, `/publicar` (feature → develop con CI como compuerta).

## 4. Hooks y permisos
| Qué | Efecto |
|---|---|
| `git-guard.js` | **Bloquea**: `--no-verify`, `--amend`, `push --force/--delete/--all`, `git add .`/`-A`, agregar `.env*` (menos `.env.example`), dumps y `node_modules`, commit/merge en `main`/`master`, push hacia `main`/`master`. **Pregunta**: cualquier otro `git push`, `gh pr create/merge`. |
| `guard-bash.cjs` | Bloquea `git push … main`, `--no-verify` y `MONGODB_DB_NAME=rincones` (producción). |
| `check-tokens.cjs` | Tras editar CSS corre `check:tokens` y avisa si falta un `var(--x)`. |
| `deny` | No leer/editar/escribir `.env*` ni `server/scripts/backups/**`; push con `--force`, `--delete`, a `main`/`master`; commit con `--no-verify`/`--amend`. |
| `ask` | `git push`, `gh pr create`, `gh pr merge`. |

**Si te bloquea:** leé el mensaje (dice qué regla y por qué), corregí el comando y no lo esquives. Si la regla frena algo legítimo, avisá y se ajusta el hook. Prueba de los hooks: `node .claude/hooks/probar-git-guard.js` y `node .claude/hooks/probar-hooks.cjs`.

## 5. Un día de trabajo
1. **Empezar**: `/traer-cambios` sólo si trabajás desde otra máquina o con más gente; si no, omitilo.
2. **`/levantar-local`**: te dice si el entorno es `test` y levanta todo. Si ve otra base, aborta.
3. **Hacer el cambio** con el agente que corresponda (`einstein-backend` server, `picasso-frontend` client).
4. **`/preparar-commit`**: agentes en paralelo, verificación (lint, tokens, tests, build) y commit. Ves el resumen; si hay hallazgo crítico/alto, frena y decidís vos. O directo **`/deploy-develop`**, que incluye ese commit y sube `develop` (te pide confirmar el push).
5. **Producción**, en otra tanda: **`/deploy-main`** → PR `develop → main`; muestra qué dispara (CI y deploy de Vercel) y espera tu OK antes de mergear.
6. **Cerrar**: `/levantar-local detener`.

## 6. Reglas de oro
- Nunca commit ni push directo a `main`: sólo por PR.
- Nunca secretos ni `.env*`; la base `rincones` es **producción**, `test` es desarrollo.
- `/deploy-develop` y `/deploy-main` van en tandas separadas, nunca encadenadas.

## 7. Si algo sale mal
- **Hallazgo crítico en la revisión**: no se commitea; mirás el hallazgo y decidís arreglar o seguir.
- **`develop` remoto con commits que no tengo**: `/deploy-develop` frena. Usá `/traer-cambios` (ff-only) y, si diverge, resolvelo vos.
- **Build o tests rotos**: se frena; los conteos de `CLAUDE.md` no pueden bajar.
- **Un hook bloquea**: ver sección 4.
- **`gh` o `git` fallan con "dubious ownership"**: ver skill `entorno-local`.
- **`main` tiene commits que `develop` no**: normal si son merges de PRs anteriores; si no, `/deploy-main` se detiene.
