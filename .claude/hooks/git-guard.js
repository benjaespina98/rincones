// Hook PreToolUse (Bash/PowerShell): guarda de git y PRs.
// Lee el JSON del hook por stdin. Exit 2 = bloquear (el motivo va por stderr);
// exit 0 + JSON con permissionDecision "ask" = pedir confirmación; exit 0 = dejar pasar.
// Falla cerrada: ante una excepción o un evento ilegible que toque git, bloquea.
// Sólo módulos nativos de Node.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Ramas protegidas: nunca se commitea, mergea ni empuja ahí. `develop` NO lo es.
const PROTECTED_BRANCHES = ["main", "master"];

// Palabras que preceden a un comando sin cambiarlo (if/then, env, sudo...).
const ENVOLTORIOS = new Set(["then", "do", "else", "elif", "if", "while", "until", "!", "env", "command", "sudo", "time", "nohup", "exec", "builtin", "call", "xargs"]);
// Programas donde la palabra "git" aparece como texto y no como comando.
const NO_ANALIZAR = new Set(["echo", "printf", "grep", "rg", "cat", "type", "write-output", "write-host"]);

const bloqueos = [];
const preguntas = [];
const bloquear = (m) => bloqueos.push(m);
const preguntar = (m) => preguntas.push(m);

// ── Tokenizador: parte el comando en segmentos respetando comillas, así un mensaje
// de commit con "&&" o "git push" adentro no dispara falsos positivos. Fuera de
// comillas también separan ( ) { } y backticks, para ver $(git ...) y subshells.
function segmentar(cmd) {
  const segs = [];
  let tokens = [];
  let cur = "";
  let q = null;
  let hay = false;
  const cerrarToken = () => {
    if (hay) tokens.push(cur);
    cur = "";
    hay = false;
  };
  const cerrarSeg = () => {
    cerrarToken();
    if (tokens.length) segs.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      hay = true;
    } else if (/\s/.test(c) && c !== "\n" && c !== "\r") {
      cerrarToken();
    } else if ("\n\r;|&(){}`".includes(c)) {
      cerrarSeg();
    } else {
      cur += c;
      hay = true;
    }
  }
  cerrarSeg();
  return segs;
}

// ── Rama actual. Falla cerrada: si no se puede saber, devuelve null.
function ramaActual(cwd) {
  try {
    // safe.directory=* evita el "dubious ownership" de este equipo (ver skill entorno-local).
    const r = execFileSync("git", ["-c", "safe.directory=*", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (r && r !== "HEAD") return r;
  } catch {}
  try {
    // Respaldo: leer .git/HEAD directamente.
    const h = fs.readFileSync(path.join(cwd, ".git", "HEAD"), "utf8").trim();
    const m = h.match(/^ref: refs\/heads\/(.+)$/);
    if (m) return m[1];
  } catch {}
  return null;
}

const limpiarRama = (r) => r.replace(/^\+/, "").replace(/^refs\/heads\//, "");
const esProtegida = (r) => PROTECTED_BRANCHES.includes(limpiarRama(r));
const base = (t) => path.basename(String(t).replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase();

// Flag largo, incluidas las abreviaturas únicas que git acepta (--amen, --del...).
const largo = (o, nombre, min) => o.startsWith("--") && o.length >= min && nombre.startsWith(o.split("=")[0]);

function analizarGit(args, cwd, cambioRama) {
  // Saltea opciones globales de git (-c k=v, -C dir, --git-dir=...) hasta el subcomando.
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "-c" && /^core\.hookspath/i.test(args[i + 1] || "")) bloquear("`-c core.hooksPath` desactiva los hooks: prohibido.");
    i += ["-c", "-C", "--git-dir", "--work-tree", "--namespace"].includes(args[i]) ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return;
  const opts = rest.filter((t) => t.startsWith("-"));
  const pos = rest.filter((t) => !t.startsWith("-"));
  // Flags cortos agrupados (-Af, -fu): se busca cada letra.
  const corto = (letras) => opts.some((o) => /^-[A-Za-z]+$/.test(o) && [...letras].some((l) => o.includes(l)));

  // Saltear hooks, en cualquier subcomando (incluye abreviaturas de --no-verify).
  if (opts.some((o) => largo(o, "--no-verify", 6))) bloquear("`--no-verify` está prohibido: arreglá la causa del fallo del hook.");

  if (sub === "commit" || sub === "merge") {
    if (sub === "commit") {
      if (opts.some((o) => largo(o, "--amend", 4))) bloquear("`--amend` está prohibido: hacé un commit nuevo.");
      if (corto("n")) bloquear("`commit -n` equivale a --no-verify: prohibido.");
    }
    // Commit/merge sobre rama protegida: bloqueado. Sin saber la rama, también (falla cerrada).
    const rama = cambioRama ? null : ramaActual(cwd);
    if (!rama) bloquear(`No pude determinar la rama actual para \`git ${sub}\` (¿cambio de rama en el mismo comando?). Bloqueo por seguridad.`);
    else if (esProtegida(rama)) bloquear(`\`git ${sub}\` en la rama protegida \`${rama}\`. Trabajá en develop y llegá a main por PR.`);
  }

  if (sub === "add") {
    // Nada de `git add .`/`-A`: se agregan archivos concretos.
    if (corto("A") || opts.some((o) => largo(o, "--all", 4))) bloquear("`git add -A/--all` está prohibido: agregá archivos concretos.");
    if (corto("f") || opts.some((o) => largo(o, "--force", 4))) bloquear("`git add --force` está prohibido (salta el .gitignore).");
    for (const p of pos) {
      const n = p.replace(/\\/g, "/");
      const b = path.posix.basename(n);
      if (n === "." || n === "./" || n === "*" || n === ":/" || /^:\(top\)/i.test(n) || n.endsWith("/.") || /^\.\.\/?$/.test(n)) bloquear("`git add .` (o equivalente) está prohibido: agregá archivos concretos.");
      else if (/^\.env/.test(b) && b !== ".env.example") bloquear(`No se agregan archivos .env* (${b}). Sólo .env.example.`);
      else if (/(^|\/)node_modules(\/|$)/.test(n)) bloquear("No se agrega node_modules.");
      else if (/\.(dump|bson|sql|archive)$/i.test(b) || /(^|\/)backups(\/|$)/.test(n)) bloquear(`No se agregan dumps de base de datos (${n}).`);
    }
  }

  if (sub === "branch") {
    if (corto("DfmM") || opts.some((o) => largo(o, "--force", 4) || largo(o, "--delete", 4) || largo(o, "--move", 4))) {
      bloquear("`git branch -D/-f/-m` está prohibido: mueve o borra ramas sin pasar por ninguna guarda.");
    }
  }

  if (sub === "reset" && opts.includes("--hard")) preguntar("`git reset --hard` descarta cambios: confirmá.");
  if (sub === "clean" && (corto("f") || opts.some((o) => largo(o, "--force", 4)))) preguntar("`git clean -f` borra archivos sin trackear: confirmá.");
  if ((sub === "checkout" || sub === "switch") && pos.some((p) => esProtegida(p))) preguntar("Pasar a la rama protegida main/master: por defecto se trabaja en develop. Confirmá.");

  if (sub === "push") {
    if (corto("fd") || opts.some((o) => largo(o, "--force", 4) || o.startsWith("--force") || largo(o, "--delete", 4) || largo(o, "--all", 4) || largo(o, "--mirror", 4))) {
      bloquear("`push --force/--delete/--all/--mirror` está prohibido.");
    }
    // pos[0] = remoto; el resto son refspecs (origen:destino).
    const refspecs = pos.slice(1);
    let rama = null;
    const necesitaRama = refspecs.length === 0 || refspecs.some((r) => r === "HEAD" || r.startsWith("HEAD:"));
    if (necesitaRama) rama = cambioRama ? null : ramaActual(cwd);
    if (necesitaRama && !rama) bloquear("No pude determinar la rama destino del push. Bloqueo por seguridad.");
    if (refspecs.length === 0 && rama && esProtegida(rama)) bloquear(`Push desde la rama protegida \`${rama}\`.`);
    for (const r of refspecs) {
      if (r.startsWith("+") || r.startsWith(":")) bloquear(`Refspec \`${r}\` (force o borrado) prohibido.`);
      const dst = r.includes(":") ? r.split(":").pop() : r;
      const destino = dst === "HEAD" ? rama : dst;
      if (destino && esProtegida(destino)) bloquear(`Push hacia la rama protegida \`${limpiarRama(destino)}\`. A main sólo se llega por PR.`);
    }
    preguntar("`git push`: confirmá que querés subir estos commits al remoto.");
  }
}

function analizarPR(args, cli) {
  const pos = args.filter((a) => !a.startsWith("-"));
  const clave = cli === "gh" ? "pr" : "mr";
  if (pos[0] === clave && ["create", "merge"].includes(pos[1])) {
    if (pos[1] === "merge" && args.some((a) => a === "--admin")) bloquear("`--admin` salta las protecciones: prohibido.");
    preguntar(`\`${cli} ${clave} ${pos[1]}\`: confirmá antes de ${pos[1] === "merge" ? "mergear" : "crear el PR/MR"}.`);
  }
}

function analizarComando(cmd, cwd, profundidad = 0) {
  if (profundidad > 4) return;
  if (/\b(Start-Process|Invoke-Expression|iex)\b/i.test(cmd) && /\bgit\b/.test(cmd)) preguntar("Comando git lanzado vía Start-Process/Invoke-Expression: confirmá.");
  const segs = segmentar(cmd);
  let cambioRama = false; // un checkout/switch previo en el mismo comando vuelve incierta la rama
  for (let tokens of segs) {
    // Saltea envoltorios (then, env, sudo...) y asignaciones de entorno (VAR=x).
    while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || ENVOLTORIOS.has(tokens[0].toLowerCase()))) tokens = tokens.slice(1);
    if (!tokens.length) continue;
    const exe = base(tokens[0]);
    const args = tokens.slice(1);

    if (exe === "git") {
      analizarGit(args, cwd, cambioRama);
      const sub = args.find((a) => !a.startsWith("-"));
      if (["checkout", "switch"].includes(sub)) cambioRama = true;
    } else if (exe === "gh" || exe === "glab") {
      analizarPR(args, exe);
    } else if (exe === "eval") {
      analizarComando(args.join(" "), cwd, profundidad + 1);
    } else if (["bash", "sh", "zsh", "pwsh", "powershell", "cmd"].includes(exe)) {
      // Intérpretes con -c / -Command / /c: se analiza el texto que ejecutan.
      const k = args.findIndex((a) => /^(-c|-command|\/c)$/i.test(a));
      if (k >= 0 && args[k + 1]) analizarComando(args.slice(k + 1).join(" "), cwd, profundidad + 1);
      const e = args.findIndex((a) => /^-e(nc(odedcommand)?)?$/i.test(a));
      if (e >= 0 && args[e + 1]) {
        // PowerShell -EncodedCommand: base64 de UTF-16LE.
        try {
          analizarComando(Buffer.from(args[e + 1], "base64").toString("utf16le"), cwd, profundidad + 1);
        } catch {
          bloquear("No pude decodificar -EncodedCommand. Bloqueo por seguridad.");
        }
      }
    } else if (!NO_ANALIZAR.has(exe)) {
      // Respaldo: si "git" o "gh" aparece como palabra suelta (xargs git, env -i git...), se analiza desde ahí.
      const ig = tokens.findIndex((t, idx) => idx > 0 && base(t) === "git");
      if (ig > 0) analizarGit(tokens.slice(ig + 1), cwd, cambioRama);
      const ih = tokens.findIndex((t, idx) => idx > 0 && ["gh", "glab"].includes(base(t)));
      if (ih > 0) analizarPR(tokens.slice(ih + 1), base(tokens[ih]));
    }
  }
}

function main(raw) {
  let cmd = "";
  let cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const ev = JSON.parse(raw);
    cmd = ev.tool_input?.command;
    if (ev.cwd) cwd = ev.cwd;
  } catch {
    // Entrada ilegible: si parece tocar git, falla cerrada; si no, no estorbo.
    if (/\bgit\b/.test(raw)) {
      process.stderr.write("Bloqueado por .claude/hooks/git-guard.js: no pude leer el evento y parece un comando git.\n");
      process.exit(2);
    }
    process.exit(0);
  }
  if (cmd === undefined || cmd === null || cmd === "") process.exit(0);
  if (typeof cmd !== "string") {
    process.stderr.write("Bloqueado por .claude/hooks/git-guard.js: el comando no es texto.\n");
    process.exit(2);
  }

  analizarComando(cmd, cwd);

  if (bloqueos.length) {
    process.stderr.write(
      "Bloqueado por .claude/hooks/git-guard.js:\n- " + [...new Set(bloqueos)].join("\n- ") + "\nNo lo esquives: corregí el comando o avisale al usuario.\n"
    );
    process.exit(2);
  }
  if (preguntas.length) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: [...new Set(preguntas)].join(" "),
        },
      })
    );
  }
  process.exit(0);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    main(raw);
  } catch (e) {
    // Falla cerrada: una excepción (exit 1) dejaría pasar el comando; con exit 2 se bloquea.
    process.stderr.write(`Bloqueado por .claude/hooks/git-guard.js: error interno (${e && e.message}).\n`);
    process.exit(2);
  }
});
