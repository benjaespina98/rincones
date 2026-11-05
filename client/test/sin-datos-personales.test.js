import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// La identidad pública del producto es 200ok.dev. Este guard falla si el nombre
// o el usuario personal vuelven a colarse en el cliente (ya pasó dos veces: en
// las páginas legales y en los placeholders del perfil). El patrón es el nombre
// completo a propósito: "Benjamín" solo es también un productor de vinos.
const PERSONAL = /Benjam[ií]n Espina|benjaespina/i;
const RAIZ = process.cwd();

const archivos = (dir) =>
  readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return [".js", ".jsx", ".css", ".html", ".svg", ".webmanifest"].includes(extname(ruta)) ? [ruta] : [];
  });

describe("identidad pública", () => {
  it("el cliente no menciona el nombre ni el usuario personal", () => {
    // Se corre desde client/ (npm test -w client). Si no, que falle fuerte y no pase vacío.
    expect(existsSync(join(RAIZ, "src")), `no encuentro src/ en ${RAIZ}`).toBe(true);
    const candidatos = [...archivos(join(RAIZ, "src")), ...archivos(join(RAIZ, "public")), join(RAIZ, "index.html")];
    const infractores = candidatos.filter((ruta) => PERSONAL.test(readFileSync(ruta, "utf8")));
    expect(infractores).toEqual([]);
    // Lee todos los archivos del cliente: con la suite entera corriendo en paralelo pasa los 5s por defecto.
  }, 30000);
});
