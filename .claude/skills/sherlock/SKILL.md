---
name: sherlock
description: Comando /sherlock. Lanza al agente sherlock (QA) para probar un cambio en la app corriendo y traer evidencia medida. Sólo lo dispara el usuario.
disable-model-invocation: true
argument-hint: "[qué probar: pantalla o flujo concreto]"
---

# /sherlock

Lanzá al agente **`sherlock`** con la herramienta Agent (`subagent_type: sherlock`).

- Con argumentos, que pruebe eso: `$ARGUMENTS`.
- Sin argumentos, preguntá qué pantalla o flujo probar: **un alcance amplio lo
  cuelga** (ya pasó con "probá toda la app"). Acotá a una pantalla o a un flujo.

Recordale que el server va aparte con `PORT=4000` contra la base `test`, que no
imprima credenciales, y que al terminar detenga el server y el preview.

Al volver, mostrá la tabla de números medidos, el veredicto (BLOQUEA / NO BLOQUEA)
y qué no pudo verificar.
