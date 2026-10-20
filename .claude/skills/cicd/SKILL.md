---
name: cicd
description: Flujo de ramas, verificación previa, CI y deploy de Rincones. Usar al commitear, abrir o mergear un PR, o antes de dar algo por terminado.
---

# CI/CD

## Ramas
`feature` → **PR a `develop`** → borrar la feature → `develop` → `main`.
- Nunca un PR de una rama de trabajo directo a `main`.
- La feature se borra **después** de mergear (antes cierra el PR): `gh pr merge --delete-branch`.
- `main` despliega producción en Vercel. Un merge local no despliega; nada llega a prod hasta el merge a `main`.
- A `main` sólo con tests en verde. Sin `--no-verify`.

## Verificar (siempre, antes de cerrar)
```bash
npm run lint -w client
npm run check:tokens -w client
npm test -w client
npm test -w server
npm run build
```
Referencia medida el 2026-10-19: **client 801**, **server 572**, tokens **155/155**, lint limpio. Los conteos pueden subir, nunca bajar. Presupuesto de carga inicial: no pasar de ~143 kB gzip (entry ≈74,9 + vendor ≈36,7 + CSS ≈11,8). Al cerrar, reportar la tabla con los números **medidos**.

## CI
`.github/workflows/ci.yml`: lint y tests en Node 22 (el runtime de las funciones en Vercel), con caché de npm y cancelación de corridas viejas. El repo es privado, así que los minutos cuestan: no agregar jobs sin motivo.

## Commits y gh
Identidad de git y ruta de `gh`: skill `entorno-local`. Mensajes de commit en español, explicando el porqué.
