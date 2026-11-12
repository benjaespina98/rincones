const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const ChangeLog = require("../src/models/changeLog.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const winePrices = require("../src/services/winePrices.service");
const winesService = require("../src/services/wines.service");

/**
 * Aislamiento entre usuarios: toda lectura o escritura de UN vino filtra por dueño. Si alguien
 * quitara `userId` del filtro, un id ajeno alcanzaría (IDOR) y ninguna otra prueba lo notaba.
 */
ChangeLog.create = async () => ({});
ChangeLog.insertMany = async () => [];
communityWines.contribute = async () => {};
communityWines.retract = async () => {};
wineImages.getImage = async () => "";
wineImages.contribute = async () => {};
winePrices.contribute = async () => {};
winePrices.retract = async () => {};

const DUENO = "u-dueno";
const VINO = "w-ajeno-o-propio";

const espiar = (metodo) => {
  const original = Wine[metodo];
  const filtros = [];
  Wine[metodo] = (filtro, ...resto) => {
    filtros.push(filtro);
    // `await` sobre el resultado: null = «no existe para vos».
    const q = Promise.resolve(null);
    q.select = () => q;
    q.lean = () => q;
    return q;
  };
  return { filtros, restaurar: () => { Wine[metodo] = original; } };
};

test("getWineById filtra por el dueño", async () => {
  const e = espiar("findOne");
  try {
    const r = await winesService.getWineById(DUENO, VINO);
    assert.equal(r, null);
  } finally { e.restaurar(); }
  assert.equal(String(e.filtros[0].userId), DUENO);
  assert.equal(String(e.filtros[0]._id), VINO);
});

test("updateWine de un vino ajeno devuelve null (404) sin escribir nada", async () => {
  const e = espiar("findOne");
  const guardados = [];
  const originalSave = Wine.prototype.save;
  Wine.prototype.save = async function () { guardados.push(this); return this; };
  try {
    const r = await winesService.updateWine(DUENO, VINO, { name: "Robado" });
    assert.equal(r, null);
  } finally { e.restaurar(); Wine.prototype.save = originalSave; }
  assert.equal(String(e.filtros[0].userId), DUENO);
  assert.equal(guardados.length, 0);
});

test("adjustStock filtra por el dueño en TODAS sus variantes", async () => {
  const variantes = [
    { delta: -1 },
    { delta: 1 },
    { quantity: 3 },
    { delta: -1, markTasted: true },
    { delta: 1, undoOpen: true, wasTasted: false },
    { delta: -1, undoRestock: true },
  ];
  const original = Wine.findOneAndUpdate;
  const originalFindOne = Wine.findOne;
  const originalExists = Wine.exists;
  const filtros = [];
  Wine.findOneAndUpdate = async (f) => { filtros.push(f); return null; };
  Wine.findOne = () => ({ select: async () => ({ tasted: false }) });
  Wine.exists = async () => null;
  try {
    for (const v of variantes) {
      assert.equal(await winesService.adjustStock(DUENO, VINO, v), null, JSON.stringify(v));
    }
  } finally {
    Wine.findOneAndUpdate = original;
    Wine.findOne = originalFindOne;
    Wine.exists = originalExists;
  }
  assert.equal(filtros.length, variantes.length);
  for (const f of filtros) assert.equal(String(f.userId), DUENO);
});

test("un vino ajeno con precondición incumplida es 404 y no 409 (no revela que existe)", async () => {
  const original = Wine.findOneAndUpdate;
  const originalExists = Wine.exists;
  const originalFindOne = Wine.findOne;
  let consulta;
  Wine.findOne = () => ({ select: async () => ({ tasted: false }) });
  Wine.findOneAndUpdate = async () => null;
  Wine.exists = async (f) => { consulta = f; return null; }; // no es TUYO: no existe para vos
  try {
    const r = await winesService.adjustStock(DUENO, VINO, { delta: -1, markTasted: true });
    assert.equal(r, null);
  } finally {
    Wine.findOneAndUpdate = original;
    Wine.exists = originalExists;
    Wine.findOne = originalFindOne;
  }
  assert.equal(String(consulta.userId), DUENO, "la consulta de existencia también filtra por dueño");
});
