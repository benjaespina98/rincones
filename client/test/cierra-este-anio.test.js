import { describe, it, expect } from "vitest";
import { cierraEsteAnio, getCellarStatus } from "../src/utils/cellarStatus";

const anio = new Date().getFullYear();

describe("cierraEsteAnio", () => {
  it("es el último año de la ventana y con botellas", () => {
    const w = { quantity: 2, type: "red", varietal: "Malbec", vintage: 2000, cellar: { drinkUntil: anio } };
    expect(getCellarStatus(w).yearsLeft).toBe(0);
    expect(cierraEsteAnio(w)).toBe(true);
  });

  it("sin botellas no cuenta aunque la ventana cierre", () => {
    expect(cierraEsteAnio({ quantity: 0, type: "red", cellar: { drinkUntil: anio } })).toBe(false);
  });

  it("si todavía le queda más de un año, no", () => {
    expect(cierraEsteAnio({ quantity: 1, type: "red", cellar: { drinkUntil: anio + 3 } })).toBe(false);
  });

  it("si ya pasó su momento o no se sabe, no", () => {
    expect(cierraEsteAnio({ quantity: 1, type: "red", cellar: { drinkUntil: anio - 1 } })).toBe(false);
    expect(cierraEsteAnio({ quantity: 1, type: "red" })).toBe(false);
    expect(cierraEsteAnio(null)).toBe(false);
  });
});
