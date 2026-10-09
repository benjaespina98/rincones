const { spawnSync } = require("node:child_process");
// Prueba los hooks con entradas simuladas. Uso: node .claude/hooks/probar-hooks.cjs
const root = require("node:path").resolve(__dirname, "..", "..").split("\\").join("/");
const run = (hook, input) =>
  spawnSync("node", [`${root}/.claude/hooks/${hook}`], { input: JSON.stringify(input), encoding: "utf8" });

const casos = [
  ["git push origin main", 2],
  ["git push origin HEAD:main", 2],
  ["git push origin develop", 0],
  ["git push origin feature/main-menu", 0],
  ["git commit " + "--no-" + "verify -m x", 2],
  ["MONGODB_DB_NAME=rincones node scripts/migrateLots.js", 2],
  ["MONGODB_DB_NAME=test node scripts/migrateLots.js", 0],
  ["npm test -w server", 0],
];
let mal = 0;
for (const [cmd, esperado] of casos) {
  const r = run("guard-bash.cjs", { tool_input: { command: cmd } });
  const ok = r.status === esperado;
  if (!ok) mal++;
  console.log(ok ? "OK " : "MAL", `exit ${r.status} (esperado ${esperado}) ::`, cmd);
}
for (const [f, esperado] of [
  [`${root}/client/src/components/Button.css`, 0],
  [`${root}/server/src/app.js`, 0],
  ["basura", 0],
]) {
  const r = run("check-tokens.cjs", { tool_input: { file_path: f } });
  const ok = r.status === esperado;
  if (!ok) mal++;
  console.log(ok ? "OK " : "MAL", `check-tokens exit ${r.status} ::`, f);
}
const bad = run("guard-bash.cjs", null);
console.log("entrada invalida -> exit", bad.status);
JSON.parse(require("node:fs").readFileSync(`${root}/.claude/settings.json`, "utf8"));
console.log("settings.json valido;", mal, "fallas");
