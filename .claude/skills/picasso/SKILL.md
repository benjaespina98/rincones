---
name: picasso
description: Comando /picasso. Lanza al agente picasso (experto visual: tokens, CSS, accesibilidad, contraste) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[archivo o tema a revisar]"
---

# /picasso

Lanzá al agente **`picasso`** con la herramienta Agent (`subagent_type: picasso`).

- Con argumentos, que revise eso: `$ARGUMENTS`.
- Sin argumentos, que revise los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá su veredicto (BLOQUEA / NO BLOQUEA) y los hallazgos por gravedad
con archivo:línea. No corrijas nada hasta que el usuario lo pida.
