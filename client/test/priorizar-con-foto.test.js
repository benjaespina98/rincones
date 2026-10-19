import { describe, expect, it } from "vitest";
import { priorizarConFoto } from "../src/utils/discovery";

const v = (id, image = "") => ({ id, image });

describe("priorizarConFoto", () => {
  it("si hay suficientes con foto, deja sólo esos y conserva su orden", () => {
    const r = priorizarConFoto([v("a"), v("b", "https://x/b.jpg"), v("c", "https://x/c.jpg"), v("d", "https://x/d.jpg"), v("e")]);
    expect(r.map((w) => w.id)).toEqual(["b", "c", "d"]);
  });

  it("si hay pocas con foto, van primero y los demás atrás (no se queda sin recomendaciones)", () => {
    const r = priorizarConFoto([v("a"), v("b", "https://x/b.jpg"), v("c")]);
    expect(r.map((w) => w.id)).toEqual(["b", "a", "c"]);
  });

  it("una foto vacía o de espacios no cuenta", () => {
    const r = priorizarConFoto([v("a", "  "), v("b", "https://x/b.jpg")], 1);
    expect(r.map((w) => w.id)).toEqual(["b"]);
  });

  it("tolera lo que no es lista", () => {
    expect(priorizarConFoto(null)).toEqual([]);
    expect(priorizarConFoto(undefined)).toEqual([]);
  });
});
