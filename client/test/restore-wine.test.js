import { describe, it, expect } from "vitest";
import { payloadParaRestaurar } from "../src/utils/restoreWine";

const VINO = {
  _id: "viejo123",
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
  createdAt: "2026-10-01T10:00:00.000Z",
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
    expect(p.createdAt).toBe("2026-10-01T10:00:00.000Z");
    expect(p.identification).toEqual({
      source: "scan",
      confidence: { winery: 95 },
      editedFields: ["region"],
      matchedFrom: "catalogo-ar",
      sameNameConfirmed: false,
    });
  });

  it("avisa de qué vino se restaura, para re-vincular sus momentos", () => {
    expect(payloadParaRestaurar(VINO).restauraDe).toBe("viejo123");
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

describe("payloadParaRestaurar: el historial de compras", () => {
  const conLotes = {
    ...VINO,
    purchase: { ...VINO.purchase, purchasedAt: "2019-03-10T00:00:00.000Z" },
    lots: [
      { addedAt: "2019-03-10T00:00:00.000Z", quantity: 6, remaining: 0, depletedAt: "2021-08-01T00:00:00.000Z", price: 9000, store: "Vinoteca", _extra: "no va" },
      { addedAt: "2026-10-01T00:00:00.000Z", quantity: 3, remaining: 3 },
    ],
  };

  it("manda los lotes (también los agotados) con sus fechas, y la fecha de compra", () => {
    const p = payloadParaRestaurar(conLotes);
    expect(p.lots).toHaveLength(2);
    expect(p.lots[0]).toEqual({
      addedAt: "2019-03-10T00:00:00.000Z",
      quantity: 6,
      remaining: 0,
      depletedAt: "2021-08-01T00:00:00.000Z",
      price: 9000,
      store: "Vinoteca",
    });
    expect(p.purchasedAt).toBe("2019-03-10T00:00:00.000Z");
  });

  it("no inventa campos que el lote no tenía y un vino sin lotes no manda nada", () => {
    expect(Object.keys(payloadParaRestaurar(conLotes).lots[1]).filter((k) => payloadParaRestaurar(conLotes).lots[1][k] !== undefined).sort()).toEqual(["addedAt", "quantity", "remaining"]);
    expect(payloadParaRestaurar(VINO).lots).toBeUndefined();
  });
});
