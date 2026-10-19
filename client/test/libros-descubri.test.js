import { describe, expect, it } from "vitest";
import { visibleContent } from "../src/data/discoverContent";
import { typeInfo } from "../src/data/contentTypes";

/**
 * "Para leer" tiene libros. Cada uno se verificó abriendo su página oficial: acá se fija que
 * sigan siendo enlaces https, que caigan en su grupo y que tengan tipo propio (ícono y CTA).
 */
describe("libros en Descubrí", () => {
  const lecturas = visibleContent(new Date("2026-10-19")).find((g) => g.id === "lecturas");
  const libros = lecturas?.items.filter((i) => i.type === "book") ?? [];

  it("hay libros en el grupo 'Para leer'", () => {
    expect(libros.length).toBeGreaterThanOrEqual(2);
  });

  it("cada libro está en español y lleva título y enlace https", () => {
    for (const l of libros) {
      expect(l.title).toBeTruthy();
      expect(l.url).toMatch(/^https:\/\//);
      expect(l.badge).toBe("En español");
    }
  });

  it("el tipo 'book' tiene su propio ícono y llamada a la acción", () => {
    const info = typeInfo("book");
    expect(info.label).toBe("Libro");
    expect(info.icon).toBe("book");
    expect(info.cta).toBeTruthy();
  });
});
