import { describe, it, expect } from "vitest";
import {
  haceCuanto,
  mensajeAbrir,
  mensajeConfirmarSacar,
  mensajeSumar,
  pistaDeStock,
  requiereConfirmarSacar,
  dondeQueda,
  mensajeSinBotellas,
  resumenTomado,
  vecesTomado,
} from "../src/utils/tomados";

const AHORA = new Date("2026-10-28T12:00:00Z");
const hace = (dias) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

describe("haceCuanto", () => {
  it.each([
    [0, "hoy"],
    [1, "ayer"],
    [5, "hace 5 días"],
    [45, "hace 1 mes"],
    [100, "hace 3 meses"],
    [29, "hace 29 días"],
    [30, "hace 1 mes"],
    [359, "hace 11 meses"],
    [360, "hace 1 año"],
    [364, "hace 1 año"],
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

describe("resumenTomado de un vino cargado ya tomado", () => {
  const ahora = new Date("2026-11-26T12:00:00Z");
  const base = { tasted: true, consumptionCount: 1, lastConsumedAt: ahora.toISOString(), quantity: 0, lots: [] };

  it("no afirma «hoy»: la fecha es la de la carga, no la de la copa", () => {
    expect(resumenTomado(base, ahora)).toBe("Tomado");
  });

  it("si estuvo en tu bodega, la fecha es de verdad y se dice", () => {
    expect(resumenTomado({ ...base, lots: [{ quantity: 1, remaining: 0 }] }, ahora)).toBe("Tomado · hoy");
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
    expect(pistaDeStock({ quantity: 0 })).toBe("Sin botellas · tocá + para sumar una al stock");
  });

  it("con botellas dice cuántas hay y qué hace el −", () => {
    expect(pistaDeStock({ quantity: 1 })).toBe("1 botella en tu bodega · tocá − para abrir una");
    expect(pistaDeStock({ quantity: 3 })).toBe("3 botellas en tu bodega · tocá − para abrir una");
  });
});

describe("requiereConfirmarSacar", () => {
  it.each([
    [{ tasted: true, consumptionCount: 1 }, true],
    [{ tasted: true, consumptionCount: 4 }, true],
    [{ tasted: true }, false], // marcado a mano: no hay historial que perder
    [{ tasted: true, consumptionCount: 0 }, false],
    [{ tasted: false, consumptionCount: 3 }, false], // marcarlo como tomado es inmediato
    [undefined, false],
  ])("%j → %s", (wine, esperado) => {
    expect(requiereConfirmarSacar(wine)).toBe(esperado);
  });

  it("el mensaje dice «1 vez» o «N veces»", () => {
    expect(mensajeConfirmarSacar({ consumptionCount: 1 })).toMatch(/^Lo abriste 1 vez\./);
    expect(mensajeConfirmarSacar({ consumptionCount: 3 })).toMatch(/^Lo abriste 3 veces\./);
  });
});

describe("mensajeSumar", () => {
  it("si ya estaba tomado aclara que sigue entre los tomados", () => {
    expect(mensajeSumar({ tasted: true }, 1, "Malbec")).toBe("1 botella sumada al stock · Malbec · sigue entre los ya tomados");
  });

  it("si no estaba tomado no dice nada de los tomados, y pluraliza", () => {
    expect(mensajeSumar({ tasted: false }, 3, "Malbec")).toBe("3 botellas sumadas al stock · Malbec");
  });
});

describe("mensajeAbrir", () => {
  it("la primera vez no cuenta veces; desde la segunda sí", () => {
    expect(mensajeAbrir({ cantidad: 1, quedan: 2, veces: 1, nombre: "Malbec" })).toBe("Botella abierta · te quedan 2");
    expect(mensajeAbrir({ cantidad: 1, quedan: 1, veces: 2, nombre: "Malbec" })).toBe("Botella abierta · te queda 1 · lo tomaste 2 veces");
  });

  it("al agotarse dice que se terminó, y no rompe sin contador", () => {
    expect(mensajeAbrir({ cantidad: 1, quedan: 0, veces: 2, nombre: "Malbec" })).toBe("Se terminó tu Malbec · lo tomaste 2 veces · sigue en «Ya tomados»");
    expect(mensajeAbrir({ cantidad: 2, quedan: 0, veces: 0, nombre: "Malbec" })).toBe("Se terminó tu Malbec · sigue en «Ya tomados»");
  });
});

describe("dónde queda un vino sin botellas", () => {
  it.each([
    [{ tasted: true, favorite: false }, "Ya tomados"],
    [{ tasted: true, favorite: true }, "Ya tomados"],
    [{ tasted: false, favorite: true }, "Favoritos"],
    [{ tasted: false, favorite: false }, "Sin stock"],
    [undefined, "Sin stock"],
  ])("%j → %s", (wine, esperado) => {
    expect(dondeQueda(wine)).toBe(esperado);
  });

  it("el aviso dice que sigue guardado y en qué pestaña", () => {
    expect(mensajeSinBotellas({ tasted: false }, "Malbec")).toBe("Sin botellas: Malbec sigue guardado en «Sin stock»");
  });
});
