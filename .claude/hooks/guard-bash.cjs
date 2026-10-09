// Hook PreToolUse (Bash): frena los comandos que el proyecto prohíbe.
// Recibe el JSON del evento por stdin. Exit 2 = bloquear y devolverle el motivo
// a Claude; exit 0 = dejar pasar.

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = JSON.parse(raw).tool_input?.command ?? "";
  } catch {
    process.exit(0); // si no entiendo el evento, no estorbo
  }

  const reglas = [
    {
      test: /--no-verify|--no-gpg-sign|commit\.gpgsign=false/,
      motivo: "Prohibido saltear hooks o firma. Arreglá la causa del fallo.",
    },
    {
      test: /\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(?:^|[\s:/])main(?:\s|$)/,
      motivo:
        "Nada se empuja a main: el flujo es feature -> PR a develop -> main (ver skill cicd).",
    },
    {
      test: /MONGODB_DB_NAME\s*=\s*['"]?rincones\b/,
      motivo:
        "La base `rincones` es PRODUCCION. Scripts y migraciones van contra `test`.",
    },
  ];

  const hit = reglas.find((r) => r.test.test(cmd));
  if (hit) {
    process.stderr.write(`Bloqueado por .claude/hooks/guard-bash.cjs: ${hit.motivo}\n`);
    process.exit(2);
  }
  process.exit(0);
});
