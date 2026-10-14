---
name: fangio
description: Comando /fangio. Lanza al agente fangio (CI/CD, bundle y rendimiento) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[pipeline, dependencia o pantalla a revisar]"
---

# /fangio

Lanzá al agente **`fangio`** con la herramienta Agent (`subagent_type: fangio`).

- Con argumentos, que revise eso: `$ARGUMENTS`.
- Sin argumentos, que revise los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá los números medidos (carga inicial gzip contra el presupuesto de
~143 kB) y su veredicto (BLOQUEA / NO BLOQUEA).
