import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

/**
 * `.app-content` es el área que scrollea. Con `overflow-y: auto` su eje X queda en `auto`
 * también, y cualquier hijo apenas más ancho se arrastra de costado. jsdom no calcula
 * layout, así que acá se fija la regla; la medida real se hace en la app corriendo.
 */
const bloque = css.match(/\.app-content\s*\{[^}]*\}/)?.[0] ?? "";

describe("el área de contenido no scrollea de costado", () => {
  test("corta el eje X", () => {
    expect(bloque).toMatch(/overflow-x:\s*hidden/);
  });
  test("no deja rebotar la página de costado", () => {
    expect(bloque).toMatch(/overscroll-behavior-x:\s*none/);
  });
});
