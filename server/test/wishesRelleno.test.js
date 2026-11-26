const test = require("node:test");
const assert = require("node:assert/strict");
const WineWish = require("../src/models/wineWish.model");
const { createWish } = require("../src/services/wishes.service");

const filtroDe = async (payload) => {
  const originales = [WineWish.findOne, WineWish.create];
  let filtro;
  WineWish.findOne = async (f) => { filtro = f; return null; };
  WineWish.create = async (doc) => doc;
  try {
    await createWish("u1", payload);
    return filtro;
  } finally {
    [WineWish.findOne, WineWish.create] = originales;
  }
};

test("si el vino se llama como su bodega, los guardados se distinguen por la uva", async () => {
  const filtro = await filtroDe({ name: "Salentein", winery: "Salentein", varietal: "Malbec" });
  assert.ok(filtro.varietal.test("malbec"));
  assert.equal(filtro.varietal.test("Cabernet"), false);
});

test("con nombre propio, la deduplicación sigue siendo por nombre y bodega", async () => {
  const filtro = await filtroDe({ name: "Numina (Gran)", winery: "Salentein", varietal: "Malbec" });
  assert.equal(filtro.varietal, undefined);
  assert.ok(filtro.name.test("numina (gran)"));
});
