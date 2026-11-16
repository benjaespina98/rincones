const test = require("node:test");
const assert = require("node:assert/strict");
const WineInfo = require("../src/models/wineInfo.model");
const WineRecipe = require("../src/models/wineRecipe.model");
const DishPairing = require("../src/models/dishPairing.model");
const wineAi = require("../src/services/wineAi.service");
const catalog = require("../src/controllers/catalog.controller");

/**
 * Ficha, receta y maridaje cuando Gemini FALLA (429, 503, timeout).
 *
 * El servicio no devuelve null en ese caso: lanza. Antes eso salía como un 500
 * genérico más un evento de error por cada bache del proveedor. Tiene que salir
 * como el 503 "ahora no se pudo" que la pantalla ya sabe mostrar.
 */

const parchar = (objeto, propiedad, valor) => {
  const original = objeto[propiedad];
  objeto[propiedad] = valor;
  return () => { objeto[propiedad] = original; };
};

const crearRes = () => {
  const r = { statusCode: null, cuerpo: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
};

const sinCache = () => ({ lean: async () => null });

const correr = async (handler, body, servicio) => {
  const restauraciones = [
    parchar(WineInfo, "findOne", sinCache),
    parchar(WineRecipe, "findOne", sinCache),
    parchar(DishPairing, "findOne", sinCache),
    parchar(wineAi, servicio, async () => { throw new Error("429 cuota agotada"); }),
    parchar(console, "error", () => {}),
  ];
  const res = crearRes();
  let siguiente = null;
  try {
    await handler({ user: { id: "u1" }, body }, res, (e) => { siguiente = e; });
  } finally {
    restauraciones.reverse().forEach((r) => r());
  }
  return { res, siguiente };
};

test("la ficha: si Gemini lanza, responde 503 y no pasa por el manejador de errores", async () => {
  const { res, siguiente } = await correr(catalog.describe, { name: "Rutini Malbec" }, "describeWine");
  assert.equal(res.statusCode, 503);
  assert.equal(siguiente, null);
});

test("la receta: si Gemini lanza, responde 503 y no pasa por el manejador de errores", async () => {
  const { res, siguiente } = await correr(catalog.recipe, { name: "Rutini Malbec" }, "suggestRecipe");
  assert.equal(res.statusCode, 503);
  assert.equal(siguiente, null);
});

test("el maridaje: si Gemini lanza, responde 503 y no pasa por el manejador de errores", async () => {
  const { res, siguiente } = await correr(catalog.pairing, { dish: "asado de tira" }, "classifyDish");
  assert.equal(res.statusCode, 503);
  assert.equal(siguiente, null);
});
