import { describe, it, expect } from "vitest";
import { esElMismoVino } from "../src/utils/catalogWine";

// Al agregar desde la búsqueda, lo que coincide se saca de Guardados: coincidir de más borra otro vino.
describe("esElMismoVino", () => {
  const malbec = { name: "Finca Humanao", winery: "Finca Humanao", varietal: "Malbec" };

  it("el Cabernet de la misma bodega no es el Malbec guardado", () => {
    expect(esElMismoVino(malbec, { ...malbec, varietal: "Cabernet Sauvignon" })).toBe(false);
  });

  it("tildes y mayúsculas no distinguen, tampoco en la uva", () => {
    expect(esElMismoVino(malbec, { name: "FINCA HUMANAO", winery: "finca humanao", varietal: "malbéc" })).toBe(true);
  });

  it("un guardado sin uva sigue coincidiendo", () => {
    expect(esElMismoVino({ ...malbec, varietal: "" }, malbec)).toBe(true);
  });

  it("sin nombre o con otra bodega no coincide", () => {
    expect(esElMismoVino({ name: "" }, { name: "" })).toBe(false);
    expect(esElMismoVino(malbec, { ...malbec, winery: "Otra" })).toBe(false);
  });
});
