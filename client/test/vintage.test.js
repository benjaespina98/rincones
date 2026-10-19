import { describe, expect, it } from "vitest";
import { leerCosecha, hayValorDeCosecha } from "../src/utils/vintage";
import { conceptAnchor, CONCEPTS } from "../src/data/wineConcepts";

const AHORA = new Date("2026-10-19");
const v = (vintage) => ({ vintage });

describe("leerCosecha: un año legible o null", () => {
  it("acepta un año como número o como texto (con espacios)", () => {
    expect(leerCosecha(v(2019), AHORA)).toBe(2019);
    expect(leerCosecha(v("2019"), AHORA)).toBe(2019);
    expect(leerCosecha(v("  2019 "), AHORA)).toBe(2019);
  });

  it("acepta el año que viene, no el siguiente", () => {
    expect(leerCosecha(v(2027), AHORA)).toBe(2027);
    expect(leerCosecha(v(2028), AHORA)).toBeNull();
  });

  it("rechaza lo anterior a 1800", () => {
    expect(leerCosecha(v(1799), AHORA)).toBeNull();
    expect(leerCosecha(v(1800), AHORA)).toBe(1800);
  });

  it("NV, rangos, vacío, null, 0 y texto devuelven null", () => {
    for (const x of ["NV", "N.V.", "2019/20", "2019-2020", "", "   ", null, undefined, 0, "0", "abc", "20195", NaN]) {
      expect(leerCosecha(v(x), AHORA), JSON.stringify(x)).toBeNull();
    }
  });

  it("tolera un vino ausente", () => {
    expect(leerCosecha(undefined, AHORA)).toBeNull();
    expect(leerCosecha(null, AHORA)).toBeNull();
    expect(leerCosecha({}, AHORA)).toBeNull();
  });
});

describe("hayValorDeCosecha: hay algo escrito, aunque no sea un año", () => {
  it("distingue 'no hay dato' de 'hay un dato que no es un año'", () => {
    expect(hayValorDeCosecha(v("NV"))).toBe(true);
    expect(hayValorDeCosecha(v("2019/20"))).toBe(true);
    expect(hayValorDeCosecha(v(2019))).toBe(true);
    for (const x of ["", "  ", null, undefined, 0, "0"]) expect(hayValorDeCosecha(v(x))).toBe(false);
  });
});

describe("ancla de 'añada': nunca un falso 'no tiene'", () => {
  const ancla = (ctx) => conceptAnchor("anada", ctx);

  it("sin vino (la lección de la home) no dice nada", () => {
    expect(ancla({})).toBeNull();
    expect(ancla()).toBeNull();
  });

  it("con cosecha, la usa (string o número) y calcula la edad", () => {
    expect(ancla({ wine: v("2019") })).toMatch(/2019/);
    expect(ancla({ wine: v(2019) })).toMatch(/2019/);
  });

  it("un vino con cosecha en un lote o con varios lotes sigue usando la del vino", () => {
    const wine = { vintage: 2020, lots: [{ remaining: 1 }, { remaining: 2 }] };
    expect(ancla({ wine })).toMatch(/2020/);
  });

  it("NV o rango: hay dato, así que no afirma que falte", () => {
    expect(ancla({ wine: v("NV") })).toBeNull();
    expect(ancla({ wine: v("2019/20") })).toBeNull();
  });

  it("null o vacío nunca se toma por el año 0", () => {
    for (const x of [null, "", undefined, 0]) {
      const r = ancla({ wine: v(x) });
      expect(r === null || !/\b0\b|2026 años/.test(r), String(r)).toBe(true);
    }
  });

  it("un vino propio sin cosecha invita a anotarla; uno del catálogo no dice nada", () => {
    expect(ancla({ wine: v(null), propio: true })).toMatch(/no tiene cosecha cargada/);
    expect(ancla({ wine: v(null), propio: false })).toBeNull();
  });
});

describe("anclas de región, cepa y bodega: si falta el dato, callan", () => {
  it("'etiqueta' (región) no inventa nada sin región", () => {
    expect(conceptAnchor("etiqueta", { wine: {} })).toBeNull();
    expect(conceptAnchor("etiqueta", { wine: { region: "Valle de Uco" } })).toMatch(/Valle de Uco/);
  });

  it("'corte' (cepa) no inventa nada sin cepa", () => {
    expect(conceptAnchor("corte", { wine: {} })).toBeNull();
    expect(conceptAnchor("corte", { wine: { varietal: "Malbec" } })).toMatch(/Malbec/);
  });

  it("ningún ancla lanza ni devuelve un falso 'no tiene' cuando no hay vino", () => {
    for (const id of Object.keys(CONCEPTS)) {
      const r = conceptAnchor(id, {});
      expect(r === null || typeof r === "string", id).toBe(true);
      if (r) expect(r, id).not.toMatch(/no tiene (cosecha|región|bodega|cepa)/i);
    }
  });
});
