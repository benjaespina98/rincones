import { describe, it, expect } from "vitest";
import { payloadParaRestaurar } from "../src/utils/restoreWine";

const VINO = {
  name: "Chardonnay",
  winery: "Zuccardi",
  line: "Serie A",
  vintage: 2020,
  region: "Mendoza",
  varietal: "Chardonnay",
  type: "white",
  rating: 4,
  favorite: true,
  tasted: true,
  quantity: 3,
  image: "https://x/a.jpg",
  notes: "rico",
  consumptionCount: 2,
  lastConsumedAt: "2026-10-01T00:00:00.000Z",
  cellar: { location: "Cava 2", shelf: "Estante 3", drinkFrom: 2024, drinkUntil: 2030 },
  purchase: { price: 15000, currency: "ARS", store: "Vinoteca" },
  identification: { verdict: "trusted", source: "scan", confidence: { winery: 95 }, editedFields: ["region"], matchedFrom: "catalogo-ar", sameNameConfirmed: false },
};

describe("payloadParaRestaurar (Deshacer tras eliminar)", () => {
  it("conserva el tipo, la cava, la compra y la evidencia de identificación", () => {
    const p = payloadParaRestaurar(VINO);
    expect(p.type).toBe("white");
    expect(p.cellarLocation).toBe("Cava 2");
    expect(p.cellarShelf).toBe("Estante 3");
    expect(p.drinkFrom).toBe(2024);
    expect(p.drinkUntil).toBe(2030);
    expect(p.price).toBe(15000);
    expect(p.store).toBe("Vinoteca");
    expect(p.consumptionCount).toBe(2);
    expect(p.identification).toEqual({
      source: "scan",
      confidence: { winery: 95 },
      editedFields: ["region"],
      matchedFrom: "catalogo-ar",
      sameNameConfirmed: false,
    });
  });

  it("no manda el veredicto: lo recalcula el servidor", () => {
    expect(payloadParaRestaurar(VINO).identification).not.toHaveProperty("verdict");
  });

  it("un vino sin cava, compra ni identificación no rompe", () => {
    const p = payloadParaRestaurar({ name: "X", quantity: 1 });
    expect(p.name).toBe("X");
    expect(p.cellarLocation).toBeUndefined();
    expect(p.price).toBeUndefined();
    expect(p.identification).toBeUndefined();
  });
});
