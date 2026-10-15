---
name: revisar-tests
description: Comando /revisar-tests. Lanza al agente pirlo (tests: cobertura, calidad, casos borde que faltan) sobre el diff o sobre lo que indiques. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[archivo o módulo a revisar]"
---

# /revisar-tests

Lanzá al agente **`pirlo`** con la herramienta Agent (`subagent_type: pirlo`).

- Con argumentos, que revise eso: `$ARGUMENTS`.
- Sin argumentos, que revise los cambios sin commitear y `git diff develop...HEAD`.

Al volver, mostrá los conteos de tests, su veredicto (BLOQUEA / NO BLOQUEA) y los
casos concretos que faltan, por riesgo. No escribas los tests hasta que el usuario
lo pida.
