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
  // Evasiones reportadas por la auditoría de seguridad.
  ["git push origin ma\\in", dDev, "2"],
  ["git pu\\sh origin main", dDev, "2"],
  ["g\\it push origin main", dDev, "2"],
  ["B=main; git push origin $B", dDev, "2"],
  ["git push origin {main,develop}", dDev, "2"],
  ["echo \"$(git push origin main)\"", dDev, "2"],
  ["git commit -m \"$(git push origin main)\"", dDev, "2"],
  ["git push origin ma`in", dDev, "2"],
  ["bash -lc \"git push origin main\"", dDev, "2"],
  ["sh -ec 'git push origin main'", dDev, "2"],
  ["pwsh -ec " + Buffer.from("git push origin main", "utf16le").toString("base64"), dDev, "2"],
  ["pwsh -Com \"git push origin main\"", dDev, "2"],
  ["echo 'git push origin main' | sh", dDev, "ask"],
  ["git -c alias.p=push p origin main", dDev, "2"],
  ["git -calias.p=push p origin main", dDev, "2"],
  ["git -ccore.hooksPath=/x commit -m x", dDev, "2"],
  ["git config alias.x '!git push origin main'", dDev, "2"],
  ["GIT_CONFIG_COUNT=1 git commit -m x", dDev, "2"],
  ["git cherry-pick abc", dMain, "2"],
  ["git rebase develop", dMain, "2"],
  ["git pull origin develop", dMain, "2"],
  ["git branch -C develop main", dDev, "2"],
  ["git push origin develop:heads/main", dDev, "2"],
  ["git push origin 'refs/heads/*:refs/heads/*'", dDev, "2"],
  ["gh -R owner/repo pr merge 5 --admin", dDev, "2"],
  ["gh -R owner/repo pr merge 5", dDev, "ask"],
  ["gh api -X DELETE repos/o/r/git/refs/heads/main", dDev, "ask"],
  ["gh repo delete o/r", dDev, "2"],
  // -C apunta a un directorio sin repo: no se puede saber la rama, falla cerrada.
  ["git -C ../otro commit -m x", dDev, "2"],
  // Segunda ronda de la auditoría.
  ["pwsh -ExecutionPolicy Bypass -EncodedCommand " + Buffer.from("git push origin main", "utf16le").toString("base64"), dDev, "2"],
  ["pwsh -NoProfile -enc " + Buffer.from("git commit -n -m x", "utf16le").toString("base64"), dDev, "2"],
  ["echo \\\"; git push origin main; echo \\\"", dDev, "2"],
  ["git --config-env=core.hooksPath=X commit -m x", dDev, "2"],
  ["export GIT_CONFIG_COUNT=1; git commit -m x", dDev, "2"],
  ["$env:GIT_CONFIG_KEY_0='core.hooksPath'; git commit -m x", dDev, "2"],
  ["git push origin \"$B\"", dDev, "2"],
  ["gh api -XPUT repos/o/r/pulls/1/merge", dDev, "ask"],
  ["gh api --method=PUT repos/o/r/pulls/1/merge", dDev, "ask"],
  ["gh api graphql -f query='mutation{x}'", dDev, "ask"],
  ["gh api repos/o/r/pulls", dDev, "0"],
  ["gh repo edit --visibility public", dDev, "ask"],
  ["gh repo view o/r", dDev, "0"],
  ["gh secret set X", dDev, "ask"],
  ["node -e \"require('child_process').execSync('git push origin main')\"", dDev, "ask"],
  ["g=git; $g push origin main", dDev, "ask"],
  ["git branch -d develop", dDev, "2"],
  ["git commit -m \"fix push ${x} en el mensaje\"", dDev, "0"],
  ["git commit -m \"el hook cubre GIT_CONFIG_COUNT y GIT_DIR\"", dDev, "0"],
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
