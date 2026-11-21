const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * La configuración de `.claude/` (skills, agentes, comandos) no la valida nadie:
 * si un archivo pierde el frontmatter o su `name` deja de coincidir con la
 * carpeta, el comando simplemente desaparece sin que falle nada. Este test es la
 * red mínima.
 */
const RAIZ = path.resolve(__dirname, "..", "..", ".claude");

const frontmatter = (texto) => {
  const m = texto.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const campos = {};
  for (const linea of m[1].split("\n")) {
    const i = linea.indexOf(":");
    if (i > 0) campos[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  return campos;
};

const skills = fs
  .readdirSync(path.join(RAIZ, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

test("hay skills", () => {
  assert.ok(skills.length >= 10, `se esperaban al menos 10 skills y hay ${skills.length}`);
});

for (const nombre of skills) {
  test(`skill ${nombre}: frontmatter válido y name == carpeta`, () => {
    const archivo = path.join(RAIZ, "skills", nombre, "SKILL.md");
    assert.ok(fs.existsSync(archivo), "falta SKILL.md");
    const fm = frontmatter(fs.readFileSync(archivo, "utf8"));
    assert.ok(fm, "sin frontmatter");
    assert.equal(fm.name, nombre);
    assert.ok(fm.description && fm.description.length > 20, "description vacía o muy corta");
  });
}

test("los comandos que lanzan agentes sólo los dispara el usuario", () => {
  const comandos = skills.filter((s) => s === "revisar" || s.startsWith("revisar-") || s === "probar-app" || s === "publicar");
  assert.ok(comandos.length >= 9);
  for (const nombre of comandos) {
    const fm = frontmatter(fs.readFileSync(path.join(RAIZ, "skills", nombre, "SKILL.md"), "utf8"));
    assert.equal(fm["disable-model-invocation"], "true", `${nombre} debe tener disable-model-invocation: true`);
  }
});

// Agentes que por diseño editan: sherlock prueba la app y los tres del estándar construyen.
const CON_ESCRITURA = new Set(["sherlock", "einstein-backend", "picasso-frontend", "automata-devops"]);

test("cada agente tiene name == nombre de archivo, description y tools de sólo lectura salvo los que construyen", () => {
  const dir = path.join(RAIZ, "agents");
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  assert.ok(archivos.length >= 7);
  for (const f of archivos) {
    const fm = frontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.ok(fm, `${f}: sin frontmatter`);
    assert.equal(fm.name, f.replace(/\.md$/, ""));
    assert.ok(fm.description && fm.description.length > 20, `${f}: description`);
    if (!CON_ESCRITURA.has(fm.name)) {
      assert.ok(fm.tools, `${f}: debe declarar tools`);
      assert.doesNotMatch(fm.tools, /\b(Edit|Write|NotebookEdit)\b/, `${f}: un agente de revisión no debe poder escribir`);
    }
  }
});

test("todo comando /revisar-* apunta a un agente que existe", () => {
  const agentes = new Set(
    fs.readdirSync(path.join(RAIZ, "agents")).map((f) => f.replace(/\.md$/, ""))
  );
  const mapa = {
    "revisar-ui": "picasso",
    "revisar-negocio": "messi",
    "revisar-seguridad": "houdini",
    "revisar-tests": "pirlo",
    "revisar-ia": "tesla",
    "revisar-build": "fangio",
    "probar-app": "sherlock",
  };
  for (const [comando, agente] of Object.entries(mapa)) {
    const cuerpo = fs.readFileSync(path.join(RAIZ, "skills", comando, "SKILL.md"), "utf8");
    assert.ok(agentes.has(agente), `no existe el agente ${agente}`);
    assert.ok(cuerpo.includes(`subagent_type: ${agente}`), `${comando} debe lanzar a ${agente}`);
  }
});
