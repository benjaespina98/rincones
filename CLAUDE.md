# Rincones

Bodega personal de vinos con sommelier IA. Monorepo npm workspaces (`client/`,
`server/`). **Tiene usuarios reales**: `main` despliega producción en Vercel.

- `client/`: React 19 + Vite 7, JavaScript, CSS plano. Tests con vitest.
- `server/`: Express 5 + Mongoose 9 (MongoDB), Gemini para el Sommelier. Tests con `node --test`.

Este archivo se carga en cada sesión, así que sólo guarda lo que **siempre** hace
falta. El detalle por tema vive en skills (se leen cuando la tarea los pide) y la
revisión experta en agentes (se llaman para una tarea acotada).

---

## Verificar (siempre, antes de cerrar cualquier cosa)

```bash
npm run lint -w client          # eslint. El server no tiene lint todavía.
npm run check:tokens -w client  # todo var(--x) usado tiene que estar declarado
npm test -w client              # vitest
npm test -w server              # node --test
npm run build                   # vite build
```

Referencia medida el 2026-10-14: **client 480**, **server 438**, tokens **144/144**,
lint limpio. Los conteos pueden subir, nunca bajar. Carga inicial: presupuesto
~143 kB gzip (entry ≈73,6 + vendor ≈35,8 + CSS).

## Flujo de ramas

`feature` → **PR a `develop`** → borrar la feature → `develop` → `main`.
Nunca un PR de una rama de trabajo directo a `main`. La feature se borra
**después** de mergear: `gh pr merge --delete-branch`. Nada llega a producción
hasta el merge a `main`.

## Reglas duras

- **Nunca** correr scripts ni migraciones contra producción: la base `rincones`
  es **producción**, `test` es desarrollo.
- **JavaScript, no TypeScript.** No migrar. **CSS plano**, sin Tailwind.
- **Cero colores literales** fuera de `index.css`.
- Sin `dangerouslySetInnerHTML`. La salida de Gemini es dato no confiable.
- Copy en **español rioplatense, de vos**.
- El estado de un vino son tres ejes independientes (`quantity`, `tasted`,
  `favorite`); `status` está deprecado.
- Los íconos son propios (`Icon.jsx`). Ya se evaluó una librería y se descartó.
- Prettier evaluado y **no adoptado**.
- Verificar **midiendo en la app corriendo** (estilos computados, tests), no a ojo.
  Al cerrar, decir cómo se verificó y qué quedó sin verificar.

## Skills (`.claude/skills/`)

| Skill | Cuándo |
|---|---|
| `reglas-de-negocio` | Tocar `quantity`, `tasted`, `favorite`, lotes o las pestañas de Mi Bodega |
| `entorno-local` | Git sin identidad, `safe.directory`, `gh` fuera del PATH, `PORT` del server, CRLF, usuario QA |
| `cicd` | Commits, PR, merge, CI, deploy |
| `diseno-y-a11y` | CSS, UI, tokens, íconos, accesibilidad, copy |
| `gemini` | Sommelier, escáner de etiquetas, streaming, costos |
| `mongo-y-migraciones` | Modelos, índices (trampa del TTL), scripts `migrate:*` |
| `publicar` | `/publicar` (feature → develop) y `/publicar main`: verificación + agentes obligatorios + CI. Sólo lo dispara el usuario |

## Agentes (`.claude/agents/`)

Cada uno es un experto de sólo lectura (salvo Sherlock, que prueba la app).
Devuelven hallazgos medidos, no opiniones.

| Agente | Experto en | Llamarlo para |
|---|---|---|
| `picasso` | Lo visual | Revisar UI, CSS, tokens, a11y, contraste |
| `messi` | Funcionalidad y negocio | Verificar flujos, ejes del vino, lotes, casos borde |
| `sherlock` | QA | Probar el cambio en la app corriendo y traer evidencia |
| `houdini` | Seguridad | Auditar auth, inyección, salida de Gemini, secretos |
| `pirlo` | Tests | Encontrar huecos de cobertura y tests flojos |
| `tesla` | IA / Gemini | Latencia, tokens, costos, prompts, fallbacks |
| `fangio` | CI/CD y rendimiento | Pipeline, bundle, velocidad de carga |

Antes de cerrar un cambio grande conviene llamar, en paralelo, a los que apliquen
(`picasso` si hay UI, `messi` si hay lógica, `houdini` si hay endpoints, `pirlo`
siempre) y a `sherlock` al final.

## Hooks (`.claude/hooks/`)

Automáticos, no se pueden olvidar: `guard-bash.cjs` bloquea `git push … main`,
`--no-verify` y scripts contra la base `rincones`; `check-tokens.cjs` corre
`check:tokens` tras editar CSS. Si uno bloquea algo legítimo, no esquivarlo:
avisar. Guía de uso de todo esto: `.claude/README.md`.

---

## Estado del rediseño

`docs/REDESIGN_PROGRESS.md`: fases hechas, decisiones con su porqué y el próximo
paso exacto. **Leerlo antes de escribir código.**
