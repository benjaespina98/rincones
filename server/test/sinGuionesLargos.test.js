const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");

/**
 * Ningún texto estático del servidor usa el guion largo (—) ni el medio (–): ni los mensajes que
 * ve el usuario ni los prompts. Importa en los prompts porque el modelo imita el estilo de lo que
 * lee: un prompt lleno de guiones largos produce respuestas llenas de guiones largos.
 *
 * SE ANALIZA: literales de texto, plantillas (template literals) de todos los .js de server/src.
 * NO SE ANALIZA: comentarios (no los ve nadie), expresiones regulares y datos de usuario.
 */
const RAIZ = path.join(__dirname, "..", "src");
const GUION = /[—–]/;

const archivos = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return e.name.endsWith(".js") ? [ruta] : [];
  });

const textosDe = (src) => {
  if (!GUION.test(src)) return [];
  const ast = parse(src, { sourceType: "script", plugins: [] });
  const halladas = [];
  const visitar = (n) => {
    if (!n || typeof n.type !== "string") return;
    const texto = n.type === "StringLiteral" ? n.value : n.type === "TemplateElement" ? n.value.cooked : null;
    if (texto && GUION.test(texto)) halladas.push(`${n.loc.start.line}: ${texto.trim().slice(0, 60)}`);
    for (const k of Object.keys(n)) {
      if (["loc", "leadingComments", "trailingComments", "innerComments"].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visitar);
      else if (v && typeof v.type === "string") visitar(v);
    }
  };
  visitar(ast.program);
  return halladas;
};

test("ningún texto estático del servidor usa guion largo ni medio", () => {
  const problemas = archivos(RAIZ).flatMap((f) =>
    textosDe(fs.readFileSync(f, "utf8")).map((t) => `${path.relative(RAIZ, f)}:${t}`)
  );
  assert.deepEqual(problemas, []);
});

test("el detector ve un guion en un texto y no en un comentario", () => {
  assert.equal(textosDe('const a = "uno — dos";').length, 1);
  assert.equal(textosDe("const a = `uno – dos`;").length, 1);
  assert.equal(textosDe("// uno — dos\nconst a = 1;").length, 0);
  assert.equal(textosDe("/* uno — dos */ const a = 1;").length, 0);
});

test("el prompt del Sommelier pide párrafos cortos y sin guiones largos", () => {
  const src = fs.readFileSync(path.join(RAIZ, "services", "sommelier.service.js"), "utf8");
  assert.match(src, /ESTILO: escribí en párrafos cortos/);
  assert.match(src, /No uses guiones largos ni guiones medios/);
});

test("el prompt de las fichas de vino pide no usar guiones largos", () => {
  const src = fs.readFileSync(path.join(RAIZ, "services", "wineAi.service.js"), "utf8");
  assert.match(src, /Sin guiones largos ni guiones medios/);
});
