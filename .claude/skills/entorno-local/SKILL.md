---
name: entorno-local
description: Cómo levantar y trabajar en el entorno local de Rincones en Windows sin caer en las trampas conocidas (identidad de git, safe.directory, gh fuera del PATH, PORT del server, CRLF, sin Python, usuario QA). Usar al arrancar el server, commitear, usar gh o editar archivos.
---

# Entorno local (Windows)

## Git
No hay identidad configurada. Commits con la que firma el historial:
```bash
git -c user.name=benjaespina98 -c user.email=83318957+benjaespina98@users.noreply.github.com commit ...
```
"Dubious ownership": `git -c safe.directory=D:/Win10/Desktop/UTN/z/Proyectos/rincones ...` (o una vez: `git config --global --add safe.directory <ruta>`).

## gh
No está en el PATH. Ruta completa:
`$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe`

`gh` llama a git por dentro, así que también tropieza con "dubious ownership" y `-c safe.directory` no le llega. Excepción sólo para ese proceso, sin tocar la config global (PowerShell):
```powershell
$env:GIT_CONFIG_COUNT="1"; $env:GIT_CONFIG_KEY_0="safe.directory"; $env:GIT_CONFIG_VALUE_0="D:/Win10/Desktop/UTN/z/Proyectos/rincones"
```
Un PR con cuerpo multilínea se arma en PowerShell con here-string `@'...'@` (en bash los saltos se complican).

## Levantar la app
- `npm run dev` levanta client y server juntos, **pero** el harness del preview exporta `PORT=5173`, el server la hereda, pisa el `PORT=4000` de su `.env` y choca con Vite. La app dice "No pudimos conectarnos".
- Para pantallas con datos: server aparte con puerto explícito.
  ```bash
  PORT=4000 npm run dev -w server
  ```
  y el client con `preview_start` (`.claude/launch.json`).
- Sin backend se pueden revisar sólo `/styleguide`, `/login`, `/register`.

## Usuario de prueba
`server/.env.qa-usuario` (`QA_EMAIL`, `QA_PASSWORD`). Leerlo del archivo; **no pegar las credenciales en el chat ni en commits**. Contra la base `test`, nunca `rincones`.

## Verificar en el navegador
El panel pinta inestable: capturas en blanco o a medias. Verificar con **estilos computados** (`javascript_tool`), `read_page` y tests, no con screenshots.

## Archivos
- Son **CRLF**: un reemplazo multilínea con `\n` no matchea. Usar regex con `\r?\n` o `sed` por número de línea.
- **No hay Python.** Scripts de una vez: Node.
