---
name: revisar-seguridad
description: Comando /revisar-seguridad. Lanza al agente houdini (seguridad: auth, inyección, salida de Gemini, secretos, producción) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[endpoint, archivo o zona a auditar]"
---

# /revisar-seguridad

Lanzá al agente **`houdini`** con la herramienta Agent (`subagent_type: houdini`).

- Con argumentos, que audite eso: `$ARGUMENTS`.
- Sin argumentos, que audite los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá su veredicto (BLOQUEA / NO BLOQUEA) separando hallazgos
**confirmados** de **plausibles**. No corrijas nada hasta que el usuario lo pida.
