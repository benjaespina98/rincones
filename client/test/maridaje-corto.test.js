import { describe, it, expect } from "vitest";
import { maridajeCorto } from "../src/data/maridajeCorto";

describe("maridajeCorto", () => {
  it("por uva, sin importar acentos ni mayúsculas", () => {
    expect(maridajeCorto({ varietal: "Malbec" })).toMatch(/carnes rojas/i);
    expect(maridajeCorto({ varietal: "TORRONTÉS" })).toMatch(/empanadas/i);
  });

  it("sin uva conocida cae al tipo; sin nada, vacío", () => {
    expect(maridajeCorto({ varietal: "Blend", type: "red" })).toMatch(/carnes/i);
    expect(maridajeCorto({ type: "sparkling" })).toMatch(/aperitivo/i);
    expect(maridajeCorto({ type: "unknown" })).toBe("");
    expect(maridajeCorto(null)).toBe("");
  });

  it("ninguna frase lleva rayas largas ni medias", () => {
    for (const t of ["red", "white", "rosé", "sparkling", "fortified"]) {
      expect(maridajeCorto({ type: t })).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
