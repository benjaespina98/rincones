import { describe, it, expect } from "vitest";
import { distribucionPorUva, filasDeUvas } from "../src/utils/distribucionPorUva";

const v = (varietal, type, quantity = 1) => ({ varietal, type, quantity });

describe("distribucionPorUva", () => {
  it("agrupa por uva, con el tipo más frecuente de cada una, de mayor a menor", () => {
    const r = distribucionPorUva([v("Malbec", "red", 3), v("Malbec", "red", 2), v("Chardonnay", "white", 1)]);
    expect(r).toEqual([
      { uva: "Malbec", n: 5, tipo: "red" },
      { uva: "Chardonnay", n: 1, tipo: "white" },
    ]);
  });

  it("fuera de «En stock» cuenta vinos, no botellas", () => {
    const r = distribucionPorUva([v("Malbec", "red", 0), v("Malbec", "red", 0), v("Merlot", "red", 1)], { porBotellas: false });
    expect(r.map((g) => [g.uva, g.n])).toEqual([["Malbec", 2], ["Merlot", 1]]);
  });

  it("junta lo que pasa del máximo y lo que no tiene uva en «Otras»", () => {
    const vinos = ["A", "B", "C", "D", "E", "F", "G"].map((u, i) => v(u, "red", 10 - i));
    vinos.push({ varietal: "", type: "white", quantity: 2 });
    const r = distribucionPorUva(vinos, { maximo: 5 });
    expect(r).toHaveLength(6);
    expect(r[5]).toMatchObject({ uva: "Otras", otras: true, tipo: "unknown" });
    expect(r[5].n).toBe(5 + 4 + 2);
  });

  it("sin vinos no hay nada", () => {
    expect(distribucionPorUva([])).toEqual([]);
  });
});


describe("filasDeUvas", () => {
  it("agrupa por uva, colorea por tipo y junta el resto en «Otras»", () => {
    const r = filasDeUvas(
      [
        { varietal: "Malbec", type: "red", count: 15 },
        { varietal: "Malbec", type: "red", count: 5 },
        { varietal: "Sauvignon Blanc", type: "white", count: 3 },
        { varietal: "A", type: "red", count: 1 },
        { varietal: "B", type: "red", count: 1 },
        { varietal: "C", type: "red", count: 1 },
        { varietal: "D", type: "red", count: 1 },
      ],
      3
    );
    expect(r.map((x) => [x.label, x.count, x.type])).toEqual([
      ["Malbec", 20, "red"],
      ["Sauvignon Blanc", 3, "white"],
      ["A", 1, "red"],
      ["Otras", 3, "unknown"],
    ]);
  });
  it("sin datos devuelve vacío", () => {
    expect(filasDeUvas(undefined)).toEqual([]);
    expect(filasDeUvas([{ varietal: "", type: "red", count: 3 }])).toEqual([]);
  });
});
