import { describe, it, expect } from "vitest";
import { haceCuanto, pistaDeStock, resumenTomado, vecesTomado } from "../src/utils/tomados";

const AHORA = new Date("2026-10-28T12:00:00Z");
const hace = (dias) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

describe("haceCuanto", () => {
  it.each([
    [0, "hoy"],
    [1, "ayer"],
    [5, "hace 5 días"],
    [45, "hace 1 mes"],
    [100, "hace 3 meses"],
    [400, "hace 1 año"],
    [800, "hace 2 años"],
  ])("%i días → %s", (dias, esperado) => {
    expect(haceCuanto(hace(dias), AHORA)).toBe(esperado);
  });

  it("no inventa nada con una fecha inválida o ausente", () => {
    expect(haceCuanto(undefined, AHORA)).toBe("");
    expect(haceCuanto("no es fecha", AHORA)).toBe("");
  });
});

describe("resumenTomado", () => {
  it("un vino sin tomar no dice nada", () => {
    expect(resumenTomado({ tasted: false, consumptionCount: 3 }, AHORA)).toBe("");
  });

  it("la primera vez no cuenta veces; desde la segunda sí", () => {
    expect(resumenTomado({ tasted: true, consumptionCount: 1, lastConsumedAt: hace(0) }, AHORA)).toBe("Tomado · hoy");
    expect(resumenTomado({ tasted: true, consumptionCount: 2, lastConsumedAt: hace(0) }, AHORA)).toBe("Tomado 2 veces · hoy");
  });

  it("un vino marcado a mano, sin fecha ni cuenta, dice sólo «Tomado»", () => {
    expect(resumenTomado({ tasted: true }, AHORA)).toBe("Tomado");
  });
});

describe("vecesTomado", () => {
  it("ignora valores que no son un número positivo", () => {
    for (const v of [undefined, null, "x", -2, 0, NaN]) expect(vecesTomado({ consumptionCount: v })).toBe(0);
    expect(vecesTomado({ consumptionCount: 3 })).toBe(3);
  });
});

describe("pistaDeStock", () => {
  it("sin botellas dice qué hace el +", () => {
    expect(pistaDeStock({ quantity: 0 })).toBe("Sin botellas · con + sumás una al stock");
  });

  it("con botellas dice cuántas hay y qué hace el −", () => {
    expect(pistaDeStock({ quantity: 1 })).toBe("1 botella en tu bodega · con − abrís una");
    expect(pistaDeStock({ quantity: 3 })).toBe("3 botellas en tu bodega · con − abrís una");
  });
});
