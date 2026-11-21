// Prueba git-guard.js con comandos simulados. Uso: node .claude/hooks/probar-git-guard.js
// Esperado: 2 = bloquea, "ask" = pide confirmación, 0 = deja pasar.
// Los casos de commit/push sin refspec dependen de la rama actual, así que se prueban
// con `git -C <dir>` apuntando a repos temporales en develop y en main.
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const hook = path.join(__dirname, "git-guard.js");
const mk = (rama) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gg-"));
  execFileSync("git", ["init", "-q", "-b", rama, d]);
  return d;
};
const dDev = mk("develop");
const dMain = mk("main");

const correr = (command, cwd) => {
  const r = spawnSync("node", [hook], { input: JSON.stringify({ tool_input: { command }, cwd }), encoding: "utf8" });
  if (r.status === 2) return "2";
  return r.stdout.includes('"ask"') ? "ask" : String(r.status);
};

const casos = [
  ["git commit --no-" + "verify -m x", dDev, "2"],
  ["git commit --amend -m x", dDev, "2"],
  ["git push --force origin develop", dDev, "2"],
  ["git push origin --delete feature/x", dDev, "2"],
  ["git push --all", dDev, "2"],
  ["git add .", dDev, "2"],
  ["git add -A", dDev, "2"],
  ["git add server/.env", dDev, "2"],
  ["git add server/.env.qa-usuario", dDev, "2"],
  ["git add client/node_modules/x.js", dDev, "2"],
  ["git add server/scripts/backups/dump.json", dDev, "2"],
  ["git commit -m x", dMain, "2"],
  ["git merge develop", dMain, "2"],
  ["git push origin main", dDev, "2"],
  ["git push origin HEAD:main", dDev, "2"],
  ["git push", dMain, "2"],
  ["bash -c \"git push origin main\"", dDev, "2"],
  ["git push origin develop", dDev, "ask"],
  ["git push -u origin develop", dDev, "ask"],
  ["gh pr create --base main --head develop", dDev, "ask"],
  ["gh pr merge 12 --merge", dDev, "ask"],
  ["glab mr create", dDev, "ask"],
  ["git commit -n -m x", dDev, "2"],
  ["git commit -m x -n", dDev, "2"],
  ["git commit -an -m x", dDev, "2"],
  ["git commit --no-verif -m x", dDev, "2"],
  ["git commit --amen", dDev, "2"],
  ["git -c core.hooksPath=/x commit -m x", dDev, "2"],
  ["echo $(git push origin main)", dDev, "2"],
  ["(git push origin main)", dDev, "2"],
  ["if true; then git push origin main; fi", dDev, "2"],
  ["env git push origin main", dDev, "2"],
  ["sudo git push origin main", dDev, "2"],
  ["xargs git push origin main", dDev, "2"],
  ["eval \"git push origin main\"", dDev, "2"],
  ["echo $(git add .)", dDev, "2"],
  ["git push -fu origin develop", dDev, "2"],
  ["git push --del origin x", dDev, "2"],
  ["git add -Af", dDev, "2"],
  ["git add -fA x", dDev, "2"],
  ["git add :/", dDev, "2"],
  ["git branch -D x", dDev, "2"],
  ["git branch -f main HEAD", dDev, "2"],
  ["gh pr merge 1 --admin", dDev, "2"],
  ["pwsh -EncodedCommand " + Buffer.from("git push origin main", "utf16le").toString("base64"), dDev, "2"],
  ["git reset --hard HEAD~1", dDev, "ask"],
  ["git checkout main", dDev, "ask"],
  ["git branch --show-current", dDev, "0"],
  ["git branch -a", dDev, "0"],
  ["git commit -m \"nota: no usar git push origin main\"", dDev, "0"],
  ["git add client/src/App.jsx server/.env.example", dDev, "0"],
  ["git -c user.name=x commit -m x", dDev, "0"],
  ["git status && git diff", dDev, "0"],
  ["npm test -w server", dDev, "0"],
];

let mal = 0;
for (const [cmd, cwd, esp] of casos) {
  const got = correr(cmd, cwd);
  if (got !== esp) mal++;
  console.log(got === esp ? "OK " : "MAL", `${got} (esperado ${esp}) ::`, cmd);
}
fs.rmSync(dDev, { recursive: true, force: true });
fs.rmSync(dMain, { recursive: true, force: true });
console.log(mal ? `${mal} fallas` : "0 fallas");
process.exit(mal ? 1 : 0);
