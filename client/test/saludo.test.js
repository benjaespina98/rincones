import { describe, it, expect } from "vitest";
import { greeting } from "../src/utils/momentCopy";

describe("el saludo de la home", () => {
  it("es el mismo durante todo un día y cambia de un día al otro", () => {
    const dia = (n) => new Date(Date.UTC(2026, 9, 1 + n, 15, 0, 0));
    expect(greeting(dia(0))).toBe(greeting(dia(0)));
    const vistos = new Set(Array.from({ length: 9 }, (_, n) => greeting(dia(n))));
    expect(vistos.size).toBeGreaterThanOrEqual(2);
  });

  it("siempre devuelve algo para acompañar con el nombre", () => {
    expect(typeof greeting()).toBe("string");
    expect(greeting().length).toBeGreaterThan(2);
  });
});
