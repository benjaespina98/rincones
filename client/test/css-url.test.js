import { describe, expect, test } from "vitest";
import { cssUrl } from "../src/utils/image";

/**
 * `cssUrl` arma el valor de `background-image: url("...")` con la URL de una
 * foto. La URL viene de datos (a veces viejos y sin filtrar) y no puede cerrar
 * el literal ni inyectar otra declaración.
 */
describe("cssUrl", () => {
  test("una URL normal queda igual, entre comillas", () => {
    expect(cssUrl("https://res.cloudinary.com/x/a.jpg?w=800")).toBe('url("https://res.cloudinary.com/x/a.jpg?w=800")');
  });

  test("codifica comillas, paréntesis y barra invertida", () => {
    const v = cssUrl('https://x.com/a.jpg"); background: red; ("');
    // El valor es `url("<contenido>")`: lo de adentro no puede traer comillas ni paréntesis.
    expect(v.startsWith('url("')).toBe(true);
    expect(v.endsWith('")')).toBe(true);
    const contenido = v.slice(5, -2);
    expect(contenido).not.toMatch(/["'()\\\s]/);
    expect(contenido).toContain("%22");
    expect(contenido).toContain("%29");
    expect(contenido).toContain("%28");
  });

  test("codifica espacios y saltos de línea", () => {
    expect(cssUrl("https://x.com/a b.jpg")).toBe('url("https://x.com/a%20b.jpg")');
    expect(cssUrl("https://x.com/a\nb")).toBe('url("https://x.com/a%0Ab")');
  });

  test("un valor vacío o nulo no rompe", () => {
    expect(cssUrl(null)).toBe('url("")');
    expect(cssUrl(undefined)).toBe('url("")');
  });

  test("un data:image base64 queda intacto", () => {
    const d = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(cssUrl(d)).toBe(`url("${d}")`);
  });
});
