---
name: messi
description: Comando /messi. Lanza al agente messi (funcionalidad y reglas de negocio: ejes del vino, lotes, flujos) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[flujo o archivo a revisar]"
---

# /messi

Lanzá al agente **`messi`** con la herramienta Agent (`subagent_type: messi`).

- Con argumentos, que revise eso: `$ARGUMENTS`.
- Sin argumentos, que revise los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá su veredicto (BLOQUEA / NO BLOQUEA) y los hallazgos por gravedad,
con el escenario concreto que rompe. No corrijas nada hasta que el usuario lo pida.
