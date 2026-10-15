# Manual de `.claude/` — Rincones

Este es **el** manual. Está en `.claude/README.md` y viaja con el repo.

## En 30 segundos

| Pregunta | Herramienta | Cómo se activa | Dónde vive |
|---|---|---|---|
| ¿Qué vale **siempre**? | `CLAUDE.md` | solo, en cada sesión | raíz |
| ¿Qué hay que **saber** de este tema? | **Skill de conocimiento** | solo, por el tema | `.claude/skills/<tema>/` |
| ¿Puede **otro par de ojos** mirar esto? | **Agente** | `/nombre` o "pasale `nombre` al diff" | `.claude/agents/` |
| ¿Qué **no puede pasar** sin depender de mí? | **Hook** | solo, automático | `.claude/hooks/` + `settings.json` |

Regla para elegir: si es **conocimiento**, skill; si es **opinión independiente**,
agente; si es una **prohibición o una verificación obligatoria**, hook.

## Los comandos `/` (lo que vas a usar)

Escribí `/` y elegí. Los comandos llevan nombre de **acción** (`/revisar-ui`) y los agentes de **persona** (`picasso`): `/revisar-ui` lanza al agente `picasso`. Escribiendo `/revisar` el autocompletado te lista todos. Todos aceptan un argumento opcional: `/revisar-ui BodegaFilters.css`.
Sin argumento revisan `develop...HEAD`.

| Comando | Para qué | Cuándo |
|---|---|---|
| `/revisar` | corre **en paralelo** los agentes que aplican al diff | antes de cerrar cualquier cambio |
| `/revisar-ui` | visual: tokens, CSS, accesibilidad, contraste | tocaste UI |
| `/revisar-negocio` | funcionalidad: ejes del vino, lotes, flujos, casos borde | tocaste lógica |
| `/revisar-seguridad` | seguridad: auth, inyección, Gemini, secretos | tocaste endpoints |
| `/revisar-tests` | tests: qué te falta cubrir | casi siempre |
| `/revisar-ia` | IA: prompts, latencia, tokens, costos | tocaste el Sommelier |
| `/revisar-build` | CI/CD, bundle, rendimiento | cambiaste dependencias o build |
| `/probar-app` | QA: prueba **en la app corriendo** | al final, con alcance acotado |
| `/publicar` | feature → `develop` con agentes + CI como compuerta | listo para integrar |
| `/publicar main` | `develop` → producción, compuerta completa | listo para producción |

Los de conocimiento se activan solos (no hace falta `/`), aunque también se pueden
forzar: `reglas-de-negocio`, `entorno-local`, `cicd`, `diseno-y-a11y`, `gemini`,
`mongo-y-migraciones`.

## La rutina de todos los días

1. **Trabajá normal.** Los skills se cargan solos y los hooks vigilan.
2. **Antes de cerrar:** `/revisar`. Corregí lo que traiga.
3. **Si cambió algo visible:** `/probar-app <pantalla o flujo>`.
4. **Para integrar:** `/publicar`. **Para producción:** `/publicar main`.

Regla práctica: un cambio chico (un texto, un margen) pide sólo CI y hooks; UI o
lógica pide `/revisar`; lo que llega a producción pide la compuerta completa.

## Reglas de oro

- **Decile qué mirar.** `/revisar-tests client/src/utils/bodegaFiltros.js` rinde más que `/revisar-tests`.
- **Plausible no es bug.** Pedí la reproducción antes de arreglar un hallazgo "plausible".
- **Un agente que no corrió no aprobó.** Si uno falla o no está, no cuenta como visto bueno.
- **`/probar-app` con alcance chico.** "Probá toda la app" lo cuelga; "Mi Bodega y el login" no.
- **Si un hook bloquea, no lo esquives.** Avisá y se ajusta el hook.
- **Los agentes no editan.** Son de sólo lectura (salvo `sherlock`, que maneja la app).
  Corregir lo decidís vos.

## Los hooks (automáticos)

| Hook | Cuándo corre | Qué hace |
|---|---|---|
| `guard-bash.cjs` | antes de cada comando Bash | bloquea `git push … main`, `--no-verify` y `MONGODB_DB_NAME=rincones` (producción) |
| `check-tokens.cjs` | después de editar un `.css` del client | corre `check:tokens`; si falta un `var(--x)`, avisa |

Exit `2` = bloquear y explicar; `0` = dejar pasar. Para sumar uno: script en
`.claude/hooks/` (Node, sin Python) + entrada en `settings.json`.

## Probar que anda

En una **sesión nueva** (los skills y agentes se descubren al arrancar):

| Qué | Cómo | Qué tendrías que ver |
|---|---|---|
| Hooks (script) | `node .claude/hooks/probar-hooks.cjs` | 11 `OK` y `0 fallas` |
| Hook en vivo | pedí "hacé `git push origin main`" | bloqueado, con el motivo |
| Skill | "¿Qué significa `tasted` en un vino?" | carga `reglas-de-negocio`, cita los 3 ejes |
| Agente / comando | `/revisar-ui` | resumen aparte con hallazgos archivo:línea |
| QA | `/probar-app Mi Bodega` | levanta el server en 4000, loguea y trae números |
| Publicar | `/publicar` en una rama con un cambio chico | verifica, llama agentes, abre el PR, espera el CI |

Si algo no aparece: revisá `name` y `description` del frontmatter y reiniciá la
sesión. Si un hook no actúa, `probar-hooks.cjs` aísla si falla el script o la
configuración.

## Mantenimiento

- **Se versiona:** `skills/`, `agents/`, `hooks/`, `settings.json`, `launch.json` y este
  archivo. **No:** `settings.local.json` (permisos personales, en `.gitignore`).
- **Un skill vale por el porqué**, no por el qué: si ya se ve en el código, no va.
- **Los conteos de tests** viven en `CLAUDE.md` y `skills/cicd`: actualizarlos juntos.
- **Agente nuevo:** `.claude/agents/<nombre>.md` con `name`, `description` (cuándo
  usarlo) y `tools`. **Comando nuevo:** carpeta con `SKILL.md`,
  `disable-model-invocation: true` y el cuerpo que dice qué lanzar.
- **Permisos para mergear sin que pregunte:** regla `allow` para `gh pr merge` en
  `settings.local.json`. Es tuya a propósito: el modo automático bloquea los merges
  por defecto.
