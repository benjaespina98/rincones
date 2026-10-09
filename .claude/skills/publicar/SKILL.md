---
name: publicar
description: Publica un cambio con los agentes expertos como compuerta obligatoria. "/publicar" lleva la rama de trabajo a develop; "/publicar main" lleva develop a producción. Sólo se ejecuta cuando el usuario lo invoca.
disable-model-invocation: true
argument-hint: "[main]"
---

# /publicar

Flujo: `feature` → (verificar + agentes + CI verde) → **develop**, se borra la feature →
(verificar + agentes + CI verde) → **main**. Cada compuerta es obligatoria: si
una falla, **se frena**, no se esquiva. Nunca `--no-verify`, nunca `--admin`,
nunca `git push` a main (el hook `guard-bash` lo bloquea). El único camino a
`main` es el PR desde `develop`.

Argumento: sin nada = **feature → develop**. `main` = **develop → main**.

---

## A. `/publicar` (feature → develop)

**0. Precondiciones.** La rama actual no es `main` ni `develop`; árbol limpio (`git status`); el cambio está commiteado.

**1. Verificar** (medir, no suponer):
```bash
npm run lint -w client && npm run check:tokens -w client && npm test -w client && npm test -w server && npm run build
```
Los conteos no pueden bajar de los de `skills/cicd`. Si algo falla: frenar y arreglar.

**2. Agentes, en paralelo, sobre `git diff develop...HEAD`.**
| Siempre | Si el diff toca… |
|---|---|
| `pirlo` (tests) · `houdini` (seguridad) · `fangio` (CI/rendimiento) | UI/CSS → `picasso` · lógica de vinos/stock → `messi` · Gemini/Sommelier → `tesla` |

Cada uno recibe el rango del diff y devuelve hallazgos por gravedad.
- **Bloquean**: hallazgos *confirmados* de gravedad alta/crítica, un hueco de test en lógica de negocio, un endpoint sin auth. → Corregir, volver al paso 1.
- **No bloquean**: los *plausibles* y los menores → van al cuerpo del PR, bajo "Observaciones".

**3. `sherlock`** si el cambio altera algo visible o un flujo del usuario: prueba en la app corriendo (server aparte en `PORT=4000`, base `test`). Sus hallazgos bloquean igual.

**4. PR a develop.** Cuerpo: qué hace, tabla medida (lint / tokens / tests / bundle), un renglón por agente con su veredicto, observaciones, y "sin verificar". Ver `entorno-local` para `gh` en PowerShell.

**5. Esperar el CI** con `ccd_pr get_status` (no hacer polling propio). Si falla: diagnosticar el check que cayó, no reintentar a ciegas.

**6. Mergear y limpiar**, sólo con CI verde y `MERGEABLE`:
```powershell
gh pr merge <N> --merge --delete-branch
```
Después `git checkout develop` y actualizar.

---

## B. `/publicar main` (develop → producción)

Producción tiene usuarios reales. Esta compuerta es más estricta.

**0.** Estar en `develop` actualizado. Verificar que no hay un PR a main ya abierto.

**1. Verificar** sobre `develop` (la misma tanda de comandos) y comparar con la última referencia.

**2. Agentes obligatorios** sobre `git diff main...develop`: `houdini`, `pirlo`, `fangio` **siempre**, más `messi`/`picasso`/`tesla` según lo que haya entrado. Y `sherlock` **siempre**: recorrido completo de la app (login, Mi Bodega, agregar/tomar un vino, Sommelier, escáner si cambió).

**3.** Cualquier hallazgo confirmado alto/crítico = **no se publica**. Se corrige en una feature nueva que vuelve a pasar por la parte A.

**4. PR `develop` → `main`**, con la tabla de verificación y el veredicto de cada agente.

**5. CI verde** (`ccd_pr get_status`) y `MERGEABLE`. Mergear **sin** `--delete-branch` (`develop` no se borra):
```powershell
gh pr merge <N> --merge
```

**6. Post-deploy.** Vercel despliega solo desde `main`: confirmar que el deploy terminó y que `/api/health` responde 200 con `db` conectada. Si no, avisar de inmediato.

---

## Reglas
- Un agente que no corrió no cuenta como aprobado. Si uno no puede correr, decirlo y frenar.
- Reportar al final: la tabla de números medidos, el veredicto por agente y qué quedó sin verificar.
- Esto no reemplaza el criterio: si algo huele mal aunque todo esté en verde, preguntar antes de mergear.
