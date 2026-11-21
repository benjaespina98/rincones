const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * El guardia de git (`.claude/hooks/git-guard.js`) es lo que impide un push a main, un --no-verify o un
 * script contra la base de producción. Su batería de casos vivía en un script que nadie corría: acá entra a
 * `npm test -w server`. La ruta sale de la raíz del repo, no del cwd (npm corre los workspaces desde server/).
 */
const RAIZ = path.resolve(__dirname, "..", "..");

test("git-guard: la batería de casos de probar-git-guard.js pasa completa", () => {
  const r = spawnSync(process.execPath, [path.join(".claude", "hooks", "probar-git-guard.js")], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: 120000,
  });
  assert.equal(r.status, 0, `probar-git-guard.js falló:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /0 fallas/);
});
