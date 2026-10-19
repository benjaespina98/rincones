import { describe, expect, it } from "vitest";
import { tiposRapidosDe } from "../src/utils/bodegaFiltros";

const TIPOS = ["red", "white", "rosé", "sparkling", "fortified"];
const v = (type) => ({ type });

describe("tiposRapidosDe", () => {
  it("cuenta cada tipo y respeta el orden de la lista de tipos", () => {
    const r = tiposRapidosDe([v("white"), v("red"), v("red"), v("sparkling")], TIPOS);
    expect(r).toEqual([
      { id: "red", n: 2 },
      { id: "white", n: 1 },
      { id: "sparkling", n: 1 },
    ]);
  });

  it("con un solo tipo no hay nada que filtrar", () => {
    expect(tiposRapidosDe([v("red"), v("red")], TIPOS)).toEqual([]);
  });

  it("ignora los sin tipo y lo que no es lista", () => {
    expect(tiposRapidosDe([v("unknown"), v(undefined), v("red")], TIPOS)).toEqual([]);
    expect(tiposRapidosDe(null, TIPOS)).toEqual([]);
  });
});
