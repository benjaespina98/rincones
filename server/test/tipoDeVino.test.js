const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const ChangeLog = require("../src/models/changeLog.model");
const User = require("../src/models/user.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const winePrices = require("../src/services/winePrices.service");
const winesService = require("../src/services/wines.service");

/**
 * Un tipo de vino fuera del enum del modelo hacía fallar `save()` con un ValidationError, y
 * el manejo de errores de los controladores lo vuelve un 500: "algo falló de nuestro lado"
 * por un dato que no era culpa del server. Pasó de verdad: "Cargar a mano" mandaba
 * `type: "click"` (el evento del toque, colado por un `onClick={fn}`) y nadie podía agregar
 * un vino a mano. El cliente ya se arregló; esto fija la defensa del server.
 */
ChangeLog.create = async () => ({});
ChangeLog.insertMany = async () => [];
WineMoment.updateMany = async () => ({ modifiedCount: 0 });
communityWines.contribute = async () => {};
communityWines.retract = async () => {};
wineImages.getImage = async () => "";
wineImages.contribute = async () => {};
winePrices.contribute = async () => {};
winePrices.retract = async () => {};

const USER_ID = new mongoose.Types.ObjectId();

/** Una consulta de mongoose falsa: se puede esperar y encadenar (`select`, `lean`, ...). */
const consultaVacia = () => {
  const q = Promise.resolve([]);
  for (const metodo of ["select", "lean", "limit", "sort", "skip"]) q[metodo] = () => q;
  return q;
};

const crear = async (type) => {
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const originalFind = Wine.find;
  Wine.find = () => consultaVacia();
  User.findById = async () => ({ stats: { winesCount: 0, tastedWines: 0 }, save: async () => {} });
  // Como el `save` real: valida contra el esquema y falla igual que en producción.
  Wine.prototype.save = async function save() {
    const error = this.validateSync();
    if (error) throw error;
    return this;
  };
  try {
    return await winesService.createWine(USER_ID, { name: "QA Manual", winery: "QA", quantity: 1, type });
  } finally {
    Wine.prototype.save = originalSave;
    User.findById = originalFindById;
    Wine.find = originalFind;
  }
};

for (const raro of ["click", "submit", "<script>", "RED", 42, {}, []]) {
  test(`createWine con el tipo ${JSON.stringify(raro)}: no falla y queda "sin tipo"`, async () => {
    const { wine } = await crear(raro);
    assert.equal(wine.type, "unknown");
  });
}

for (const valido of ["red", "white", "rosé", "sparkling", "fortified", "unknown"]) {
  test(`createWine conserva el tipo válido "${valido}"`, async () => {
    const { wine } = await crear(valido);
    assert.equal(wine.type, valido);
  });
}

test("createWine sin tipo queda en unknown", async () => {
  const { wine } = await crear(undefined);
  assert.equal(wine.type, "unknown");
});

const editar = async (type) => {
  const originalFindOne = Wine.findOne;
  const originalFindById = User.findById;
  User.findById = async () => ({ stats: { winesCount: 1, tastedWines: 0 }, save: async () => {} });
  const vino = new Wine({ userId: USER_ID, name: "Cabernet", quantity: 1, type: "red" });
  vino.save = async function save() {
    const error = this.validateSync();
    if (error) throw error;
    return this;
  };
  Wine.findOne = async () => vino;
  try {
    return await winesService.updateWine(USER_ID, "wine-1", { type });
  } finally {
    Wine.findOne = originalFindOne;
    User.findById = originalFindById;
  }
};

test('updateWine ignora un tipo inválido ("click"): conserva el que tenía y no falla', async () => {
  const actualizado = await editar("click");
  assert.equal(actualizado.type, "red");
});

test("updateWine aplica un tipo válido", async () => {
  const actualizado = await editar("white");
  assert.equal(actualizado.type, "white");
});
