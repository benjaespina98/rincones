const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const winesService = require("../src/services/wines.service");

const USER_ID = "000000000000000000000001";
const hace = (horas) => new Date(Date.now() - horas * 60 * 60 * 1000);

/** Cuenta un momento sobre un vino con cierto historial y devuelve el vino resultante. */
const contarMomento = async ({ count, ultima, tasted = true, consumedAt }) => {
  const originalFindOne = Wine.findOne;
  const originalCreate = WineMoment.create;
  const originalFindById = User.findById;
  const vino = new Wine({ userId: USER_ID, name: "Malbec", quantity: 1, tasted });
  vino.consumptionCount = count;
  vino.lastConsumedAt = ultima;
  vino.save = async function save() {
    return this;
  };
  Wine.findOne = async () => vino;
  WineMoment.create = async (doc) => ({ ...doc, consumedAt: consumedAt || new Date() });
  User.findById = async () => ({ stats: {}, save: async () => {} });
  try {
    await winesService.addMoment(USER_ID, "wine-1", { notes: "cena", consumedAt });
    return vino;
  } finally {
    Wine.findOne = originalFindOne;
    WineMoment.create = originalCreate;
    User.findById = originalFindById;
  }
};

test("contar el momento de la botella que acabás de abrir no suma otra toma", async () => {
  const vino = await contarMomento({ count: 1, ultima: hace(0.1) });
  assert.equal(vino.consumptionCount, 1, "una botella abierta es una toma, la cuentes o no");
});

test("un momento de otra ocasión (de otro día) sí suma una toma", async () => {
  const vino = await contarMomento({ count: 1, ultima: hace(48), consumedAt: new Date() });
  assert.equal(vino.consumptionCount, 2);
});

test("un momento sobre un vino que nunca tomaste (lo tomaste afuera) cuenta la primera toma", async () => {
  const vino = await contarMomento({ count: 0, ultima: undefined, tasted: false });
  assert.equal(vino.consumptionCount, 1);
  assert.equal(vino.tasted, true);
});

test("un momento anterior no retrocede la última toma", async () => {
  const ultima = hace(1);
  const vino = await contarMomento({ count: 1, ultima, consumedAt: hace(100) });
  assert.equal(new Date(vino.lastConsumedAt).getTime(), ultima.getTime());
});
