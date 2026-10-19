import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";

/**
 * Ningún texto estático del cliente usa el guion largo (—) ni el medio (–).
 *
 * Es un recurso de estilo que la app dejó de usar: se separa con punto, coma o dos puntos.
 *
 * QUÉ SE ANALIZA (explícito):
 *   · los literales de texto ("..." y '...'), las plantillas (`...`) y el texto suelto de JSX,
 *     de todos los .js y .jsx de client/src.
 *
 * QUÉ NO SE ANALIZA (exclusiones):
 *   · los comentarios de código (// y /* *\/ y los de JSX): no los ve el usuario. El parser los
 *     deja fuera del árbol, así que no hay una regla de texto que se pueda confundir.
 *   · las expresiones regulares (no son texto: p. ej. /[-/+]/ ).
 *   · los datos del usuario: no están en el código, llegan por la API.
 *   · los .css y los tests.
 *
 * Si un texto legítimo necesitara el guion (por ejemplo, un rango que una librería exigiera), se
 * agrega acá a EXCEPCIONES con el archivo y el motivo; hoy no hay ninguna.
 */
const RAIZ = join(process.cwd(), "src");
const GUION = /[—–]/;
const EXCEPCIONES = []; // [{ archivo: "ruta/relativa.jsx", motivo: "..." }]

const archivos = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return /\.(js|jsx)$/.test(e.name) ? [ruta] : [];
  });

const textosDe = (src) => {
  if (!GUION.test(src)) return [];
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const halladas = [];
  const visitar = (n) => {
    if (!n || typeof n.type !== "string") return;
    const texto =
      n.type === "StringLiteral" || n.type === "JSXText"
        ? n.value
        : n.type === "TemplateElement"
          ? n.value.cooked
          : null;
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

const textosConGuion = (ruta) => textosDe(readFileSync(ruta, "utf8"));

describe("sin guion largo ni medio en textos estáticos", () => {
  it("ningún literal, plantilla ni texto JSX los usa", () => {
    const excluidos = new Set(EXCEPCIONES.map((e) => e.archivo));
    const problemas = archivos(RAIZ)
      .filter((f) => !excluidos.has(relative(RAIZ, f).split("\\").join("/")))
      .flatMap((f) => textosConGuion(f).map((t) => `${relative(RAIZ, f)}:${t}`));
    expect(problemas).toEqual([]);
  });

  it("el detector sí ve un guion en un texto, en una plantilla y en JSX, y no en un comentario", () => {
    // Sanidad del propio test: sin esto, un parser roto dejaría pasar todo.
    expect(textosDe('const a = "uno — dos";')).toHaveLength(1);
    expect(textosDe("const a = `uno – dos`;")).toHaveLength(1);
    expect(textosDe("const a = <p>uno — dos</p>;")).toHaveLength(1);
    expect(textosDe("// uno — dos\nconst a = 1;")).toHaveLength(0);
    expect(textosDe("/* uno — dos */ const a = 1;")).toHaveLength(0);
    expect(textosDe("const a = /[—–]/;")).toHaveLength(0);
  });
});
