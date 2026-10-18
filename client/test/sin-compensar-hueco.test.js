import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * En iOS standalone el viewport de layout puede ser más corto que la pantalla, y iOS NO pinta
 * nada más allá de él. Bajar la barra ese hueco la dejaba en su lugar pero cortada, sin
 * etiquetas. `--vp-gap` es sólo diagnóstico (`?vp=1`): ningún CSS de posición puede usarlo.
 */
const archivos = [
  "src/components/AppLayout.css",
  "src/components/BottomTabNavigation.css",
  "src/components/AddWineButton.css",
  "src/pages/BodyPage.css",
  "src/pages/SuggestionsPage.css",
];

describe("el layout no compensa el hueco del viewport", () => {
  for (const f of archivos) {
    test(`${f} no resta --vp-gap`, () => {
      const css = readFileSync(resolve(process.cwd(), f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css).not.toMatch(/var\(--vp-gap/);
    });
  }
});

describe("la barra sigue anclada abajo", () => {
  test("BottomTabNavigation.css fija `bottom: 0` en el contenedor", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/BottomTabNavigation.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const bloque = css.match(/\.bottom-tabs-container\s*\{[^}]*\}/)?.[0] ?? "";
    expect(bloque).toMatch(/position:\s*fixed/);
    expect(bloque).toMatch(/bottom:\s*0/);
  });
});

describe("el documento tiene recorrido para que el empujón de iOS funcione", () => {
  test("en modo app, #root mide 2px más que la pantalla", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/@media \(display-mode: standalone\)\s*\{\s*#root\s*\{\s*min-height:\s*calc\(100dvh \+ 2px\)/);
  });
});
