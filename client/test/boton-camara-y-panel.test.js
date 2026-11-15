import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dos cosas que sólo se rompen en silencio:
 *  - el botón de cámara era una cámara sola que flotaba y tapaba "Eliminar" en el modo selección (la barra de
 *    acciones queda justo debajo), así que mientras se elige no se dibuja;
 *  - los botones del panel de una fila (Favorito, Eliminar) llevan texto: un tacho suelto no
 *    dice qué borra.
 */
const leer = (f) => readFileSync(resolve(process.cwd(), f), "utf8");

describe("Escanear es un lugar de la barra, con nombre", () => {
  test("el botón dice \"Agregar vino\" y no flota sobre el contenido", () => {
    const jsx = leer("src/components/AddWineButton.jsx");
    const css = leer("src/components/AddWineButton.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(jsx).toMatch(/Agregar vino/);
    const base = css.match(/\.add-fab\s*\{[^}]*\}/)?.[0] ?? "";
    expect(base).not.toMatch(/position:\s*fixed/);
  });
});

describe("el panel de la fila nombra sus acciones", () => {
  const jsx = leer("src/components/WineRowPanel.jsx");
  test("Favorito y Eliminar son sólo ícono pero tienen nombre accesible y tooltip", () => {
    expect(jsx).toMatch(/aria-label="Favorito"/);
    expect(jsx).toMatch(/aria-label="Eliminar"/);
    expect(jsx).toMatch(/title="Eliminar"/);
  });
  test("no repite el tipo, que ya está en la etiqueta de la fila", () => {
    expect(jsx).not.toMatch(/\["Tipo"/);
  });
});
