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
    // createWine devuelve { wine, merged, added }: `merged` distingue un vino
    // nuevo de una reposición de algo que ya tenías.
    const { wine, merged } = await winesService.createWine("user-1", {
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

    assert.equal(merged, false, "un vino que no tenías no es una reposición");
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

test("volver a cargar un vino que ya tenías suma stock en vez de duplicarlo", async () => {
  const originalFind = Wine.find;
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;
  const originalUserFindById = User.findById;

  // Ya tenés 1 botella de este vino, y ya lo probaste.
  const existente = {
    _id: "w1",
    name: "Catena Alta Malbec",
    winery: "Catena Zapata",
    line: "Alta",
    varietal: "Malbec",
    vintage: 2019,
    quantity: 1,
    tasted: true,
    status: "tasted",
  };

  let pipeline = null;
  Wine.find = () => ({ select: async () => [existente] });
  Wine.findOneAndUpdate = async (_filtro, stages) => {
    pipeline = stages;
    // Lo que devolvería Mongo tras aplicar el pipeline.
    return { ...existente, quantity: 3, restockedAt: new Date() };
  };
  User.findById = async () => ({ stats: {}, save: async () => {} });

  try {
    const { wine, merged, added } = await winesService.createWine("user-1", {
      name: "Catena Alta Malbec",
      winery: "Catena Zapata",
      line: "Alta",
      varietal: "Malbec",
      vintage: "2019",
      quantity: 2,
    });

    assert.equal(merged, true, "debería reconocerlo como reposición");
    assert.equal(added, 2);
    assert.equal(wine.quantity, 3, "1 que tenías + 2 que cargaste");
    assert.equal(wine.tasted, true, "el historial no se pierde al reponer");
    assert.ok(wine.restockedAt instanceof Date, "queda registrada la reposición");

    // Las botellas nuevas entran como su propio lote, con fecha de hoy, y todo
    // pasa en un único update para que dos cargas seguidas no pierdan stock.
    const json = JSON.stringify(pipeline);
    assert.ok(json.includes('"$concatArrays"'), "las 2 botellas son un lote nuevo");
    assert.ok(json.includes('"addedAt":"$$NOW"'), "fechado hoy, no el día del alta");
    assert.ok(json.includes('"restockedAt":"$$NOW"'));
    assert.ok(json.includes('"$$l.remaining"'), "el stock sale de lo que queda en cada lote");
  } finally {
    restore(Wine, "find", originalFind);
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
    restore(User, "findById", originalUserFindById);
  }
});

test("bajar el stock consume del lote más viejo, y subirlo abre uno nuevo", async () => {
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;

  let pipeline = null;
  Wine.findOneAndUpdate = async (_filtro, stages) => {
    pipeline = stages;
    return { _id: "w1" };
  };

  try {
    await winesService.adjustStock("user-1", "w1", { delta: -1 });
    assert.ok(
      JSON.stringify(pipeline).includes('"$reduce"'),
      "consumir recorre los lotes de más viejo a más nuevo"
    );

    await winesService.adjustStock("user-1", "w1", { delta: 2 });
    assert.ok(
      JSON.stringify(pipeline).includes('"addedAt":"$$NOW"'),
      "reponer agrega un lote con la fecha de hoy"
    );

    await winesService.adjustStock("user-1", "w1", { quantity: 7 });
    const json = JSON.stringify(pipeline);
    assert.ok(json.includes('"$literal":7'), "fijar un total exacto usa ese número");
    assert.ok(json.includes('"$reduce"') && json.includes('"addedAt":"$$NOW"'),
      "y acomoda los lotes hacia donde haga falta");

    // Una cantidad inválida no puede vaciar la cava por un error de tipeo.
    await winesService.adjustStock("user-1", "w1", { quantity: "abc" });
    assert.ok(
      JSON.stringify(pipeline).includes('"$literal":0'),
      "sin dato válido no se mueve ninguna botella"
    );
  } finally {
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
  }
});

test("marcar 'probado' NO mueve el stock: es un dato del historial", async () => {
  const originalFindOne = Wine.findOne;
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const originalUpdateOne = Wine.updateOne;
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;

  const user = { stats: { winesCount: 1, tastedWines: 0 }, save: async () => {} };
  User.findById = async () => user;
  Wine.prototype.save = async function save() { return this; };

  // Si alguno de estos dos llegara a correr, es que marcar probado volvió a
  // tocar el stock por atrás.
  let tocoElStock = false;
  Wine.updateOne = async () => { tocoElStock = true; return { matchedCount: 1 }; };
  Wine.findOneAndUpdate = async () => { tocoElStock = true; return null; };

  const vino = new Wine({ userId: "user-1", name: "Saint Felicien", quantity: 2, tasted: false });
  vino.save = async function save() { return this; };
  Wine.findOne = async () => vino;

  try {
    const marcado = await winesService.updateWine("user-1", "w1", { tasted: true });
    assert.equal(marcado.tasted, true);
    assert.equal(marcado.quantity, 2, "seguís teniendo las dos botellas");
    assert.equal(marcado.status, "tasted");
    assert.equal(tocoElStock, false, "marcar probado no puede descontar botellas");

    // Y al revés: destildar tampoco devuelve nada.
    const desmarcado = await winesService.updateWine("user-1", "w1", { tasted: false });
    assert.equal(desmarcado.tasted, false);
    assert.equal(desmarcado.quantity, 2);
    assert.equal(tocoElStock, false);
  } finally {
    restore(Wine, "findOne", originalFindOne);
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalFindById);
    restore(Wine, "updateOne", originalUpdateOne);
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
  }
});

test("abrir una botella descuenta Y deja el vino probado, en un solo update", async () => {
  const originalFindOne = Wine.findOne;
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;
  const originalFindById = User.findById;

  const user = { stats: { tastedWines: 0 }, save: async () => {} };
  User.findById = async () => user;
  Wine.findOne = () => ({ select: async () => ({ tasted: false }) });

  let pipeline = null;
  let updates = 0;
  Wine.findOneAndUpdate = async (_filtro, stages) => {
    pipeline = stages;
    updates += 1;
    return { _id: "w1", tasted: true, quantity: 1 };
  };

  try {
    await winesService.adjustStock("user-1", "w1", { delta: -1, markTasted: true });

    const json = JSON.stringify(pipeline);
    assert.equal(updates, 1, "descontar y marcar probado son un solo hecho, un solo update");
    assert.ok(json.includes('"tasted":true'), "abrir una botella marca el vino como probado");
    assert.ok(json.includes('"lastConsumedAt":"$$NOW"'), "y deja registrada la fecha");
    assert.ok(json.includes('"$reduce"'), "el descuento sigue siendo FIFO");
    assert.equal(user.stats.tastedWines, 1, "el contador del perfil acompaña");

    // El "−" pelado no miente sobre tu historial: descontar no siempre es tomártelo.
    await winesService.adjustStock("user-1", "w1", { delta: -1 });
    assert.ok(
      !JSON.stringify(pipeline).includes('"tasted":true'),
      "restar stock a secas no marca nada como probado"
    );
  } finally {
    restore(Wine, "findOne", originalFindOne);
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
    restore(User, "findById", originalFindById);
  }
});

test("la cosecha distingue: un 2021 no se mezcla con el 2019 que ya tenías", async () => {
  const originalFind = Wine.find;
  const originalSave = Wine.prototype.save;
  const originalUserFindById = User.findById;

  const delDosMilDiecinueve = {
    _id: "w1", name: "Catena Alta Malbec", winery: "Catena Zapata",
    line: "Alta", varietal: "Malbec", vintage: 2019, quantity: 1,
    save: async function () { return this; },
  };

  Wine.find = () => ({ select: async () => [delDosMilDiecinueve] });
  Wine.prototype.save = async function () { return this; };
  User.findById = async () => ({ stats: {}, save: async () => {} });

  try {
    const { merged } = await winesService.createWine("user-1", {
      name: "Catena Alta Malbec",
      winery: "Catena Zapata",
      line: "Alta",
      varietal: "Malbec",
      vintage: "2021",
    });

    assert.equal(merged, false, "otra cosecha es otra botella para quien colecciona");
    assert.equal(delDosMilDiecinueve.quantity, 1, "no se tocó el stock del 2019");
  } finally {
    restore(Wine, "find", originalFind);
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalUserFindById);
  }
});
