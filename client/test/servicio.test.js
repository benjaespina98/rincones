import { describe, it, expect } from "vitest";
import { lineaDeServicio, conviene, temperaturaDeServicio } from "../src/utils/servicio";

describe("servicio", () => {
  it("la temperatura sale del tipo", () => {
    expect(temperaturaDeServicio({ type: "white" })).toBe("8-10 °C");
    expect(temperaturaDeServicio({ type: "unknown" })).toBe("");
    expect(temperaturaDeServicio(null)).toBe("");
  });

  it("un tinto tánico joven conviene airearlo; uno viejo o de uva suave, no", () => {
    expect(conviene({ type: "red", varietal: "Cabernet Sauvignon", vintage: 2021 }, 2026)).toBe(true);
    expect(conviene({ type: "red", varietal: "Cabernet Sauvignon", vintage: 2005 }, 2026)).toBe(false);
    expect(conviene({ type: "red", varietal: "Pinot Noir", vintage: 2021 }, 2026)).toBe(false);
    expect(conviene({ type: "white", varietal: "Chardonnay" }, 2026)).toBe(false);
  });

  it("la línea suma el aire sólo cuando sirve", () => {
    expect(lineaDeServicio({ type: "red", varietal: "Malbec", vintage: 2022 }, 2026)).toBe("Servilo a 16-18 °C · airealo 30 min");
    expect(lineaDeServicio({ type: "white", varietal: "Torrontés" }, 2026)).toBe("Servilo a 8-10 °C");
    expect(lineaDeServicio({ type: "unknown" }, 2026)).toBe("");
  });

  it("un tinto con 10+ años se decanta con cuidado, no se airea", () => {
    expect(lineaDeServicio({ type: "red", varietal: "Malbec", vintage: 2012 }, 2026)).toBe("Servilo a 16-18 °C · decantalo con cuidado");
    expect(lineaDeServicio({ type: "red", varietal: "Pinot Noir", vintage: 2014 }, 2026)).toBe("Servilo a 16-18 °C · decantalo con cuidado");
  });

  it("sin cosecha no se afirma nada de decantar, y un blanco viejo no se decanta", () => {
    expect(lineaDeServicio({ type: "red", varietal: "Pinot Noir" }, 2026)).toBe("Servilo a 16-18 °C");
    expect(lineaDeServicio({ type: "white", varietal: "Chardonnay", vintage: 2010 }, 2026)).toBe("Servilo a 8-10 °C");
  });
});
