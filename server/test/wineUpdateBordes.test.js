const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false); // sin base: lo no stubeado falla en el acto en vez de esperar 10 s
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const ChangeLog = require("../src/models/changeLog.model");
const User = require("../src/models/user.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const winePrices = require("../src/services/winePrices.service");
const winesService = require("../src/services/wines.service");

/**
 * Bordes de `updateWine`: el stock viaja SIEMPRE por el pipeline atómico, un valor inválido no lo toca y un
 * `findOneAndUpdate` que devuelve null (el vino se borró en el medio) no rompe la edición.
 */

ChangeLog.create = async () => ({});
WineMoment.updateMany = async () => ({ modifiedCount: 0 });
communityWines.contribute = async () => {};
communityWines.retract = async () => {};
wineImages.getImage = async () => "";
wineImages.contribute = async () => {};
winePrices.contribute = async () => {};
winePrices.retract = async () => {};
User.updateOne = async () => ({});

const USER_ID = new mongoose.Types.ObjectId();

const conEntorno = async (vino, fn) => {
  const o = { findOne: Wine.findOne, save: Wine.prototype.save, foau: Wine.findOneAndUpdate, fById: User.findById };
  const llamadas = [];
  Wine.findOne = async () => vino;
  Wine.prototype.save = async function save() {
    return this;
  };
  Wine.findOneAndUpdate = async (filtro, etapas, opts) => {
    llamadas.push({ filtro, etapas, opts });
    return Object.assign(vino, { quantity: 5 });
  };
  User.findById = async () => ({ _id: USER_ID, email: "a@b.c", role: "user", stats: {}, save: async () => {} });
  try {
    return await fn(llamadas);
  } finally {
    Wine.findOne = o.findOne;
    Wine.prototype.save = o.save;
    Wine.findOneAndUpdate = o.foau;
    User.findById = o.fById;
  }
};

const vino = (extra = {}) =>
  Wine.hydrate({ _id: new mongoose.Types.ObjectId(), userId: USER_ID, name: "Cabernet", quantity: 3, tasted: false, ...extra });

test("un vino SIN lots (anterior a los lotes) con quantity 3 se edita sin romper y el stock se fija por el pipeline", async () => {
  const w = vino(); // sin `lots`
  assert.ok(!w.lots || w.lots.length === 0);
  await conEntorno(w, async (llamadas) => {
    const r = await winesService.updateWine(USER_ID, w._id, { notes: "Sin lotes" });
    assert.equal(r.notes, "Sin lotes");
    assert.equal(llamadas.length, 0, "sin quantity no se toca el stock");

    await winesService.updateWine(USER_ID, w._id, { quantity: 5 });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].opts.updatePipeline, true);
    assert.ok(Array.isArray(llamadas[0].etapas));
    assert.ok(JSON.stringify(llamadas[0].etapas).includes('"$literal":5'));
  });
});

test("una quantity inválida (-1, 'abc', '', null, NaN) NO toca el stock", async () => {
  for (const malo of [-1, "abc", "", null, Number.NaN, "-3"]) {
    const w = vino();
    await conEntorno(w, async (llamadas) => {
      await winesService.updateWine(USER_ID, w._id, { quantity: malo, notes: "x" });
      assert.equal(llamadas.length, 0, `quantity=${JSON.stringify(malo)} no debe tocar el stock`);
      assert.equal(w.quantity, 3, "y el documento conserva sus 3 botellas");
    });
  }
});

test("quantity 0 en un vino probado lo deja 'archived'; sin probar queda 'stock'", async () => {
  const probado = vino({ tasted: true });
  await conEntorno(probado, async (llamadas) => {
    const r = await winesService.updateWine(USER_ID, probado._id, { quantity: 0 });
    assert.equal(r.status, "archived");
    assert.ok(JSON.stringify(llamadas[0].etapas).includes('"$literal":0'));
  });
  const sinProbar = vino({ tasted: false });
  await conEntorno(sinProbar, async () => {
    const r = await winesService.updateWine(USER_ID, sinProbar._id, { quantity: 0 });
    assert.equal(r.status, "stock");
  });
});

test("si el findOneAndUpdate del stock devuelve null (el vino ya no está), la edición devuelve el documento guardado sin romper", async () => {
  const w = vino();
  const o = { foau: Wine.findOneAndUpdate };
  await conEntorno(w, async () => {
    Wine.findOneAndUpdate = async () => null;
    const r = await winesService.updateWine(USER_ID, w._id, { quantity: 2, notes: "n" });
    assert.ok(r, "no revienta ni devuelve null");
    assert.equal(r.notes, "n");
  });
  Wine.findOneAndUpdate = o.foau;
});

test("updateWine de un vino que no es tuyo devuelve null sin tocar nada", async () => {
  await conEntorno(null, async (llamadas) => {
    assert.equal(await winesService.updateWine(USER_ID, new mongoose.Types.ObjectId(), { quantity: 1 }), null);
    assert.equal(llamadas.length, 0);
  });
});
