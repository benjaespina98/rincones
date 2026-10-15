---
name: revisar-ia
description: Comando /revisar-ia. Lanza al agente tesla (IA y Gemini: prompts, modelos, latencia, tokens, costos, fallbacks) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[servicio, prompt o flujo de IA a revisar]"
---

# /revisar-ia

Lanzá al agente **`tesla`** con la herramienta Agent (`subagent_type: tesla`).

- Con argumentos, que revise eso: `$ARGUMENTS`.
- Sin argumentos, que revise los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá su veredicto (BLOQUEA / NO BLOQUEA) y el impacto estimado de cada
hallazgo (segundos, tokens, costo). No corrijas nada hasta que el usuario lo pida.
