// Hook PostToolUse (Edit|Write): después de tocar un .css del client, verifica
// que todo var(--x) usado esté declarado. Un token sin declarar no da error: el
// navegador descarta la regla en silencio (ver skill diseno-y-a11y).
// Exit 2 = devolverle el problema a Claude; exit 0 = todo bien o no aplica.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = JSON.parse(raw).tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  const f = file.replace(/\\/g, "/");
  if (!/\/client\/src\/.*\.css$/.test(f)) process.exit(0);

  const root = path.resolve(__dirname, "..", "..");
  const r = spawnSync("node", ["scripts/check-tokens.cjs"], {
    cwd: path.join(root, "client"),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stderr.write(
      `check:tokens falló tras editar ${path.basename(f)}:\n${r.stdout}${r.stderr}`
    );
    process.exit(2);
  }
  process.exit(0);
});
