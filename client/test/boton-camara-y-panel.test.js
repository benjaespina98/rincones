import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dos cosas que sólo se rompen en silencio:
 *  - el botón de cámara tapaba "Eliminar" en el modo selección de Mi Bodega (la barra de
 *    acciones queda justo debajo), así que mientras se elige no se dibuja;
 *  - los botones del panel de una fila (Favorito, Eliminar) llevan texto: un tacho suelto no
 *    dice qué borra.
 */
const leer = (f) => readFileSync(resolve(process.cwd(), f), "utf8");

describe("el botón de cámara no tapa la barra de selección", () => {
  test("se oculta mientras existe la barra de acciones", () => {
    expect(leer("src/components/AddWineButton.css")).toMatch(
      /body:has\(\.bodega-barra\)\s+\.add-fab\s*\{\s*display:\s*none/
    );
  });
});

describe("el panel de la fila nombra sus acciones", () => {
  const jsx = leer("src/components/WineRowPanel.jsx");
  test("Favorito y Eliminar tienen texto visible", () => {
    expect(jsx).toMatch(/Favorito\s*\n\s*<\/button>/);
    expect(jsx).toMatch(/Eliminar\s*\n\s*<\/button>/);
  });
  test("no repite el tipo, que ya está en la etiqueta de la fila", () => {
    expect(jsx).not.toMatch(/\["Tipo"/);
  });
});
