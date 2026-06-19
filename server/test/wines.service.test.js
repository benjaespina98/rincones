const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const User = require("../src/models/user.model");
const winesService = require("../src/services/wines.service");

const restore = (object, key, value) => {
  object[key] = value;
};

test("wines service creates a wine and updates user stats", async () => {
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const originalStats = { ...Wine.schema.paths };

  let savedUser = false;
  const user = { stats: { winesCount: 0, tastedWines: 0 }, save: async () => { savedUser = true; } };

  User.findById = async () => user;
  Wine.prototype.save = async function save() { return this; };

  try {
    const wine = await winesService.createWine("user-1", {
      name: "Malbec",
      winery: "Bodega X",
      vintage: "2020",
      region: "Mendoza",
      varietal: "Malbec",
      notes: "Frutado",
      favorite: true,
      tasted: true,
      quantity: 2,
    });

    assert.equal(wine.name, "Malbec");
    assert.equal(wine.status, "tasted");
    assert.equal(user.stats.winesCount, 1);
    assert.equal(user.stats.tastedWines, 1);
    assert.equal(savedUser, true);
  } finally {
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalFindById);
    void originalStats;
  }
});

test("wines service updates and removes wines", async () => {
  const originalFindOne = Wine.findOne;
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const originalDeleteOne = Wine.deleteOne;

  const user = { stats: { winesCount: 1, tastedWines: 1 }, save: async () => {} };
  User.findById = async () => user;
  Wine.prototype.save = async function save() { return this; };
  Wine.deleteOne = async () => ({ deletedCount: 1 });

  const existingWine = new Wine({
    userId: "user-1",
    name: "Cabernet",
    quantity: 3,
    tasted: true,
    status: "tasted",
  });
  existingWine.save = async function save() { return this; };
  Wine.findOne = async () => existingWine;

  try {
    const updatedWine = await winesService.updateWine("user-1", "wine-1", {
      name: "Cabernet Reserva",
      quantity: 5,
      tasted: false,
    });

    assert.equal(updatedWine.name, "Cabernet Reserva");
    assert.equal(updatedWine.quantity, 5);
    assert.equal(updatedWine.tasted, false);

    const deleted = await winesService.deleteWine("user-1", "wine-1");
    assert.equal(deleted, true);
    assert.equal(user.stats.winesCount, 0);
    assert.equal(user.stats.tastedWines, 0);
  } finally {
    restore(Wine, "findOne", originalFindOne);
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalFindById);
    restore(Wine, "deleteOne", originalDeleteOne);
  }
});

test("wines service returns moments for an existing wine", async () => {
  const originalFindOne = Wine.findOne;
  const originalFind = WineMoment.find;

  Wine.findOne = async () => ({ _id: "wine-1" });
  WineMoment.find = () => ({ sort: async () => ([{ _id: "m1" }, { _id: "m2" }]) });

  try {
    const moments = await winesService.getMoments("user-1", "wine-1");
    assert.equal(moments.length, 2);
  } finally {
    restore(Wine, "findOne", originalFindOne);
    restore(WineMoment, "find", originalFind);
  }
});
