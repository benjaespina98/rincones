# Cómo usar `.claude/` en Rincones

Tres herramientas, tres momentos distintos. Elegí por la pregunta:

| Pregunta | Herramienta | Dónde |
|---|---|---|
| ¿Qué reglas valen **siempre**? | CLAUDE.md | raíz del repo |
| ¿Cómo se hace **esta tarea** / qué hay que saber de **este tema**? | Skill | `.claude/skills/<tema>/SKILL.md` |
| ¿Puede **otro par de ojos** revisar o probar esto? | Agente | `.claude/agents/<nombre>.md` |
| ¿Qué **tiene que pasar sí o sí**, sin depender de que me acuerde? | Hook | `.claude/hooks/` + `settings.json` |

## Skills: se activan solos
No hace falta llamarlos. Claude los lee cuando la descripción coincide con la tarea.
Para forzar uno, nombralo: "usá el skill `gemini`".

| Skill | Tema |
|---|---|
| `reglas-de-negocio` | `quantity`/`tasted`/`favorite`, lotes, pestañas de Mi Bodega |
| `entorno-local` | git sin identidad, `gh`, `PORT`, CRLF, usuario QA |
| `cicd` | ramas, PR, verificación, CI |
| `diseno-y-a11y` | CSS, tokens, íconos, accesibilidad, copy |
| `gemini` | Sommelier, escáner, streaming, costos |
| `mongo-y-migraciones` | bases `test`/`rincones`, TTL, `migrate:*` |

## Agentes: se llaman por nombre
"Pasale `picasso` al diff." Trabajan aparte y devuelven un resumen, así que no
llenan la conversación. Son de **sólo lectura** (salvo Sherlock).

| Agente | Usalo cuando… |
|---|---|
| `picasso` | tocaste UI/CSS: tokens, a11y, contraste |
| `messi` | tocaste lógica de vinos, stock, filtros o flujos |
| `houdini` | agregaste o cambiaste un endpoint, auth, subida de archivos |
| `pirlo` | querés saber qué te falta testear |
| `tesla` | tocaste prompts, modelos o el Sommelier |
| `fangio` | cambiaste dependencias, build, CI o ves lentitud |
| `sherlock` | ya está hecho y hay que **probarlo en la app corriendo** |

**Receta antes de cerrar un cambio:**
1. En paralelo, los que apliquen (`picasso`, `messi`, `houdini`, `pirlo`).
2. Corregir lo que traigan.
3. `sherlock` al final, con la tabla de lint / tests / tokens / bundle.

**Buenas prácticas**
- Decile al agente *qué* mirar ("el diff de `develop...HEAD`", "`BodegaFilters.jsx`"): sin foco, revisa de más.
- Un hallazgo "plausible" no es un bug: pedí la reproducción antes de arreglar.
- No pidas a dos agentes lo mismo. Cada uno tiene su carril.

## Hooks: automáticos y no negociables
Corren solos; Claude no los puede olvidar ni saltear.

| Hook | Cuándo | Qué hace |
|---|---|---|
| `guard-bash.cjs` | antes de cada comando Bash | bloquea `git push … main`, `--no-verify` y `MONGODB_DB_NAME=rincones` (producción) |
| `check-tokens.cjs` | después de editar un `.css` del client | corre `check:tokens`; si falta un `var(--x)`, se lo avisa a Claude |

Si un hook bloquea algo que es legítimo, **no lo esquives**: avisame y se ajusta el hook.
Para agregar uno: script en `.claude/hooks/` (Node, sin Python) + entrada en `settings.json`.
Exit `2` = bloquear y explicar; `0` = dejar pasar.

## Publicar: `/publicar`
El flujo `feature → develop → main` con los agentes como compuerta obligatoria.
Sólo lo dispara el usuario (no se ejecuta solo).

| Comando | Hace |
|---|---|
| `/publicar` | verifica → `pirlo`+`houdini`+`fangio` (+`picasso`/`messi`/`tesla` según el diff) → `sherlock` → PR a `develop` → CI verde → merge y se borra la feature |
| `/publicar main` | verifica `develop` → los mismos agentes + `sherlock` siempre → PR `develop → main` → CI verde → merge → confirma el deploy |

Si un agente trae un hallazgo confirmado alto/crítico, o el CI cae, **se frena**.
Detalle en `skills/publicar/SKILL.md`.

Para que corra sin pedir permiso en cada merge, agregá a `settings.local.json`
una regla `allow` para `gh pr merge` (es tuya: el modo automático bloquea los
merges por defecto, y es a propósito).

## Cómo probar que todo funciona
Abrí una **sesión nueva** (los agentes y skills se descubren al arrancar).

| Qué | Probalo así | Qué tendrías que ver |
|---|---|---|
| **Hooks** | `node .claude/hooks/probar-hooks.cjs` | 11 líneas `OK` y `0 fallas` |
| Hook en vivo (guard) | pedile a Claude: "hacé `git push origin main`" | Bloqueado, con el motivo |
| Hook en vivo (tokens) | pedile que use `var(--no-existe)` en un `.css` del client | Aviso de `check:tokens` tras la edición |
| **Skill** | "¿Qué significa `tasted` en un vino?" | Aparece que cargó `reglas-de-negocio` y la respuesta cita los 3 ejes |
| Skill (otro) | "¿Cómo subo un PR con gh?" | Carga `entorno-local`/`cicd` y menciona la ruta de `gh` |
| **Agente** | "Pasale `picasso` al diff de `develop...HEAD`" | Un resumen aparte con hallazgos archivo:línea, no una charla |
| Agente QA | "`sherlock`, probá Mi Bodega" | Levanta el server en 4000, loguea con el usuario QA y trae números |
| **Publicar** | `/publicar` en una rama con un cambio chico | Verifica, llama a los agentes, abre el PR y espera el CI |

Si un agente o skill no aparece, revisá el frontmatter (`name`, `description`)
y reiniciá la sesión. Si un hook no actúa, corré `probar-hooks.cjs` para aislar
si falla el script o la configuración en `settings.json`.

## Qué se versiona y qué no
- Se versiona: `skills/`, `agents/`, `hooks/`, `settings.json`, `launch.json`, este archivo.
- No se versiona: `settings.local.json` (permisos personales; está en `.gitignore`).

## Mantenimiento
- Un skill es corto y vale por el **porqué**, no por el qué. Si algo ya se ve en el código, no va.
- Los conteos de tests viven en CLAUDE.md y `skills/cicd`. Actualizarlos juntos.
- Agente nuevo = un archivo `.md` con `name`, `description` (cuándo usarlo) y `tools`. Skill nuevo = carpeta con `SKILL.md` y `description` que diga **cuándo** activarlo.
- Sesión nueva para que Claude vea agentes o skills recién creados.
