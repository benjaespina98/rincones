import { describe, it, expect } from "vitest";
import { textoDeEtiqueta } from "../src/utils/fichaDeEtiqueta";

describe("textoDeEtiqueta", () => {
  it("junta corte, crianza y graduación", () => {
    expect(
      textoDeEtiqueta({ composition: "60% Malbec, 40% Cabernet Franc", aging: "12 meses en roble francés", alcohol: 13.5 })
    ).toBe("De la etiqueta: Corte: 60% Malbec, 40% Cabernet Franc · Crianza: 12 meses en roble francés · 13,5% alc.");
  });
  it("sin nada que decir devuelve vacío", () => {
    expect(textoDeEtiqueta({})).toBe("");
    expect(textoDeEtiqueta({ composition: " ", aging: "", alcohol: 0 })).toBe("");
    expect(textoDeEtiqueta()).toBe("");
  });
  it("una graduación fuera de rango no se muestra", () => {
    expect(textoDeEtiqueta({ alcohol: 60 })).toBe("");
  });
});
