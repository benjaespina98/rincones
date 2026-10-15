---
name: revisar
description: Comando /revisar. Corre en paralelo los agentes que aplican al diff (pirlo siempre; picasso, messi, houdini, tesla, fangio según lo que se tocó) y junta los veredictos. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[rango de git, por defecto develop...HEAD]"
---

# /revisar

La revisión de antes de cerrar un cambio, en un solo comando. No publica nada:
para eso está `/publicar`.

## Pasos

1. Mirá qué se tocó: `git status` y `git diff --stat ${ARGUMENTS:-develop...HEAD}`.
2. Elegí los agentes según el diff y lanzalos **en paralelo** (un solo mensaje, varias
   llamadas Agent):

   | Si el diff toca… | Agente |
   |---|---|
   | siempre | `pirlo` |
   | CSS, componentes, íconos, textos visibles | `picasso` |
   | stock, lotes, filtros, flujos de vinos (`client/src/utils`, `server/src/services`) | `messi` |
   | rutas, controladores, auth, subida de archivos, `.env` | `houdini` |
   | `gemini.service`, `sommelier`, `wineAi`, `labels`, `vision` | `tesla` |
   | `package*.json`, build, CI, `vercel.json`, dependencias | `fangio` |

3. Si el cambio altera algo visible o un flujo del usuario, **al final** sugerí
   `/sherlock` con un alcance acotado (no lo lances sin que el usuario lo pida).
4. Mostrá una tabla: agente | veredicto | hallazgos clave. Después los hallazgos
   por gravedad, sin duplicar los que coinciden entre agentes.

## Reglas
- Un agente que no corrió no cuenta como aprobado: si uno no pudo correr, decilo.
- No corrijas nada hasta que el usuario lo pida.
- Si algún agente no está disponible en la sesión, corré un agente genérico con las
  instrucciones de su archivo `.claude/agents/<nombre>.md` y aclaralo en el reporte.
