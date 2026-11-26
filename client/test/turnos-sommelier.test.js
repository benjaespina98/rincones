import { describe, it, expect } from "vitest";
import { vinosMostrados, turnoParaServidor } from "../src/utils/turnosSommelier";

describe("contexto del Sommelier", () => {
  it("manda los vinos de la tarjeta sólo con nombre, bodega, uva y tipo", () => {
    const m = { wines: [{ _id: "1", name: "Serie A", winery: "Zuccardi", varietal: "Malbec", type: "red", image: "x" }] };
    expect(vinosMostrados(m)).toEqual([{ name: "Serie A", winery: "Zuccardi", varietal: "Malbec", type: "red" }]);
  });

  it("si no hay vinos tuyos usa las sugerencias, hasta 3", () => {
    const m = { wines: [], descubrir: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, {}] };
    expect(vinosMostrados(m).map((v) => v.name)).toEqual(["a", "b", "c"]);
  });

  it("un turno del asistente manda sus vinos", () => {
    expect(turnoParaServidor({ role: "assistant", text: "ok", wines: [{ name: "a", type: "red" }] }).wines).toEqual([
      { name: "a", type: "red" },
    ]);
  });

  it("un turno sin vinos no lleva el campo", () => {
    expect(turnoParaServidor({ role: "user", text: "hola", wines: [], extra: 1 })).toEqual({ role: "user", text: "hola" });
  });
});
