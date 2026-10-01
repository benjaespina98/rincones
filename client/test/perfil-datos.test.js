import { describe, it, expect } from "vitest";
import {
  decimal,
  fraseDelMes,
  esUva,
  limpiarRegion,
  agrupar,
  conRepeticion,
  queMostrarDeLaInversion,
} from "../src/utils/perfilDatos";

/**
 * Los datos del perfil que dejaban dudar del resto: cada caso sale de una
 * pantalla real (11 vinos, uno solo con precio, regiones en tres formatos).
 */

describe("decimal", () => {
  it("escribe con coma, como el resto de la app", () => {
    expect(decimal(4.4)).toBe("4,4");
    expect(decimal(5)).toBe("5,0");
  });
});

describe("fraseDelMes", () => {
  it("con cero no festeja un cero", () => {
    expect(fraseDelMes({ esteMes: 0, esteAnio: 9, anio: 2026 })).toBe(
      "Este mes todavía no tomaste ninguno · 9 en 2026"
    );
  });

  it("singular y plural bien dichos", () => {
    expect(fraseDelMes({ esteMes: 1, esteAnio: 9, anio: 2026 })).toBe(
      "Tomaste 1 vino distinto este mes · 9 en 2026"
    );
    expect(fraseDelMes({ esteMes: 3, esteAnio: 9, anio: 2026 })).toBe(
      "Tomaste 3 vinos distintos este mes · 9 en 2026"
    );
  });
});

describe("esUva", () => {
  it("un corte no es una uva", () => {
    for (const v of ["Blend", "blend", "Corte", "Assemblage", "Cuvée", "Ensamble"]) {
      expect(esUva(v)).toBe(false);
    }
  });

  it("las uvas de verdad pasan, incluida una que contiene 'blend' en el nombre", () => {
    expect(esUva("Malbec")).toBe(true);
    expect(esUva("Cabernet Sauvignon")).toBe(true);
    expect(esUva("Blend de Malbec")).toBe(true);
  });

  it("vacío o sin dato no es una uva", () => {
    expect(esUva("")).toBe(false);
    expect(esUva(null)).toBe(false);
  });
});

describe("limpiarRegion", () => {
  it("saca el país pegado, la barra del formato de origen y el inglés", () => {
    expect(limpiarRegion("Mendoza Argentina")).toBe("Mendoza");
    expect(limpiarRegion("Salta | Argentina")).toBe("Salta");
    expect(limpiarRegion("Calchaquí Valley")).toBe("Calchaquí Valle");
  });

  it("se queda con lo que distingue una región de otra", () => {
    expect(limpiarRegion("Luján de Cuyo, Mendoza")).toBe("Luján de Cuyo");
  });

  it("no toca una región que ya está bien, ni inventa nada con vacío", () => {
    expect(limpiarRegion("Patagonia")).toBe("Patagonia");
    expect(limpiarRegion("")).toBe("");
    expect(limpiarRegion(undefined)).toBe("");
  });
});

describe("agrupar", () => {
  const regiones = [
    { region: "Mendoza", count: 2 },
    { region: "Mendoza Argentina", count: 1 },
    { region: "Luján de Cuyo", count: 1 },
  ];

  it("suma las que, ya limpias, son la misma, y ordena de mayor a menor", () => {
    const r = agrupar(regiones, "region", limpiarRegion);
    expect(r.map((x) => [x.region, x.count])).toEqual([
      ["Mendoza", 3],
      ["Luján de Cuyo", 1],
    ]);
  });

  it("descarta las que se quedan sin nombre y no muta la entrada", () => {
    const entrada = [{ region: "", count: 5 }, { region: "Salta", count: 1 }];
    const copia = JSON.parse(JSON.stringify(entrada));
    expect(agrupar(entrada, "region", limpiarRegion)).toHaveLength(1);
    expect(entrada).toEqual(copia);
  });
});

describe("conRepeticion", () => {
  it("un ranking donde nada se repite no queda: son una lista, no un ranking", () => {
    expect(conRepeticion([{ count: 1 }, { count: 1 }, { count: 1 }])).toEqual([]);
  });

  it("deja sólo lo que se repitió", () => {
    expect(conRepeticion([{ count: 7 }, { count: 2 }, { count: 1 }])).toHaveLength(2);
  });
});

describe("queMostrarDeLaInversion", () => {
  it("un vino con precio sobre once no es una inversión: se dice cuánto falta", () => {
    const r = queMostrarDeLaInversion({
      winesWithPrice: 1,
      totalVinos: 11,
      avgPriceByType: [{ type: "red", avgPrice: 9800 }],
      bestValueWine: { name: "X" },
    });
    expect(r.total).toBe(false);
    expect(r.mejorRelacion).toBe(false);
    expect(r.porTipo).toBe(false);
    expect(r.aviso).toBe("Cargaste el precio de 1 de 11 vinos. Con más, acá ves cuánto invertís.");
  });

  it("sin ningún precio no hay aviso ni sección", () => {
    const r = queMostrarDeLaInversion({ winesWithPrice: 0, totalVinos: 11 });
    expect(r).toEqual({ total: false, mejorRelacion: false, porTipo: false, aviso: null });
  });

  it("con precio en 3 vinos y una cuarta parte de la bodega, el total ya dice algo", () => {
    const r = queMostrarDeLaInversion({ winesWithPrice: 3, totalVinos: 12 });
    expect(r.total).toBe(true);
  });

  it("tres con precio en una bodega de cuarenta sigue siendo poco", () => {
    expect(queMostrarDeLaInversion({ winesWithPrice: 3, totalVinos: 40 }).total).toBe(false);
  });

  it("el promedio por tipo con un solo tipo repetiría el total: no se muestra", () => {
    const base = { winesWithPrice: 5, totalVinos: 8, bestValueWine: { name: "X" } };
    expect(queMostrarDeLaInversion({ ...base, avgPriceByType: [{ type: "red" }] }).porTipo).toBe(false);
    expect(
      queMostrarDeLaInversion({ ...base, avgPriceByType: [{ type: "red" }, { type: "white" }] }).porTipo
    ).toBe(true);
  });

  it("la mejor relación hace falta compararla: sin el dato, no se muestra", () => {
    const r = queMostrarDeLaInversion({ winesWithPrice: 4, totalVinos: 8, bestValueWine: null });
    expect(r.mejorRelacion).toBe(false);
  });
});
