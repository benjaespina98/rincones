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
const wishesRoutes = require("../src/routes/wishes.routes");
const wishesService = require("../src/services/wishes.service");

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
const usuario = () => ({ _id: USER_ID, email: "a@b.c", role: "user", stats: {}, save: async () => {} });

/** Un vino "ya guardado" (no nuevo) con 3 botellas en un lote, como lo devuelve findOne. */
const vinoGuardado = () =>
  Wine.hydrate({
    _id: new mongoose.Types.ObjectId(),
    userId: USER_ID,
    name: "Cabernet",
    quantity: 3,
    tasted: false,
    lots: [{ quantity: 3, remaining: 3, addedAt: new Date("2024-01-01") }],
  });

const conEntorno = async (fn) => {
  const o = {
    findOne: Wine.findOne,
    find: Wine.find,
    save: Wine.prototype.save,
    foau: Wine.findOneAndUpdate,
    updateMany: Wine.updateMany,
    deleteMany: Wine.deleteMany,
    fById: User.findById,
    momentos: WineMoment.updateMany,
    retract: winePrices.retract,
  };
  User.findById = async () => usuario();
  try {
    return await fn();
  } finally {
    Wine.findOne = o.findOne;
    Wine.find = o.find;
    Wine.prototype.save = o.save;
    Wine.findOneAndUpdate = o.foau;
    Wine.updateMany = o.updateMany;
    Wine.deleteMany = o.deleteMany;
    User.findById = o.fById;
    WineMoment.updateMany = o.momentos;
    winePrices.retract = o.retract;
  }
};

const huellaDelStock = (ruta) => ruta === "quantity" || ruta === "lots" || ruta.startsWith("lots.");

test("updateWine sin quantity NO persiste quantity ni lots (no pisa un adjustStock concurrente)", async () => {
  await conEntorno(async () => {
    const vino = vinoGuardado();
    let rutasAlGuardar = null;
    let tocoElStock = false;
    Wine.findOne = async () => vino;
    Wine.findOneAndUpdate = async () => {
      tocoElStock = true;
      return null;
    };
    Wine.prototype.save = async function save() {
      rutasAlGuardar = this.modifiedPaths();
      return this;
    };

    await winesService.updateWine(USER_ID, vino._id, { notes: "Para el domingo", rating: 4 });

    assert.ok(rutasAlGuardar.includes("notes"));
    assert.deepEqual(rutasAlGuardar.filter(huellaDelStock), [], "el stock no viaja en el save()");
    assert.equal(tocoElStock, false);
  });
});

test("updateWine con quantity fija el total con el pipeline atomico y acotado, no con save()", async () => {
  await conEntorno(async () => {
    const vino = vinoGuardado();
    let rutasAlGuardar = null;
    let pipeline = null;
    Wine.findOne = async () => vino;
    Wine.prototype.save = async function save() {
      rutasAlGuardar = this.modifiedPaths();
      return this;
    };
    Wine.findOneAndUpdate = async (filtro, etapas, opts) => {
      pipeline = { filtro, etapas, opts };
      return Object.assign(vino, { quantity: 5 });
    };

    const r = await winesService.updateWine(USER_ID, vino._id, { quantity: 5 });

    assert.deepEqual(rutasAlGuardar.filter(huellaDelStock), []);
    assert.ok(Array.isArray(pipeline.etapas), "es un pipeline, no un $set desde una lectura vieja");
    assert.equal(pipeline.opts.updatePipeline, true);
    assert.equal(String(pipeline.filtro.userId), String(USER_ID));
    assert.ok(JSON.stringify(pipeline.etapas).includes('"$literal":5'));
    assert.equal(r.quantity, 5);

    // Y el tope: un numero absurdo se acota como en lots.js.
    await winesService.updateWine(USER_ID, vino._id, { quantity: 99999999 });
    assert.ok(JSON.stringify(pipeline.etapas).includes('"$literal":100000'));
  });
});

test("adjustStock acota delta y quantity a 100000", async () => {
  await conEntorno(async () => {
    let etapas = null;
    Wine.findOneAndUpdate = async (_f, e) => {
      etapas = JSON.stringify(e);
      return { tasted: false };
    };

    await winesService.adjustStock(USER_ID, "w1", { delta: 9999999999 });
    assert.ok(etapas.includes('"$literal":100000'));
    assert.ok(!etapas.includes("9999999999"));

    await winesService.adjustStock(USER_ID, "w1", { quantity: 5000000 });
    assert.ok(etapas.includes('"$literal":100000'));
    assert.ok(!etapas.includes("5000000"));
  });
});

test("createWine con la cuenta ya eliminada falla ANTES de guardar: no deja un vino huerfano", async () => {
  await conEntorno(async () => {
    let guardado = false;
    User.findById = async () => null;
    Wine.find = () => {
      const q = Promise.resolve([]);
      for (const m of ["select", "lean", "limit", "sort", "skip"]) q[m] = () => q;
      return q;
    };
    Wine.prototype.save = async function save() {
      guardado = true;
      return this;
    };
    await assert.rejects(
      () => winesService.createWine(USER_ID, { name: "Fantasma", winery: "X", quantity: 1 }),
      (e) => e.codigo === "CUENTA_INEXISTENTE"
    );
    assert.equal(guardado, false);
  });
});

test("bulkAction procesa un tope y devuelve los ids reales y cuantos quedaron afuera", async () => {
  await conEntorno(async () => {
    const ids = Array.from({ length: 250 }, () => String(new mongoose.Types.ObjectId()));
    let filtroUsado = null;
    Wine.updateMany = async (f) => {
      filtroUsado = f;
      return { modifiedCount: 200 };
    };
    const r = await winesService.bulkAction(USER_ID, ids, "favorite");
    assert.equal(r.ids.length, winesService.MAX_EN_LOTE);
    assert.deepEqual(r.ids, ids.slice(0, winesService.MAX_EN_LOTE));
    assert.equal(r.omitidos, 50);
    assert.equal(filtroUsado._id.$in.length, winesService.MAX_EN_LOTE);
  });
});

test("bulkAction delete: prepara el borrado por tandas en paralelo (max. 10) y devuelve los ids borrados", async () => {
  await conEntorno(async () => {
    const ids = Array.from({ length: 35 }, () => new mongoose.Types.ObjectId());
    const vinos = ids.map((_id) => ({
      _id,
      name: "n",
      winery: "w",
      varietal: "v",
      type: "red",
      tasted: false,
      purchase: { price: 10 },
    }));
    Wine.find = () => {
      const q = Promise.resolve(vinos);
      q.select = () => q;
      q.lean = () => q;
      return q;
    };
    Wine.deleteMany = async () => ({ deletedCount: 35 });

    let enVuelo = 0;
    let maximo = 0;
    let retractos = 0;
    WineMoment.updateMany = async () => {
      enVuelo += 1;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo -= 1;
      return {};
    };
    winePrices.retract = async () => {
      retractos += 1;
    };

    const r = await winesService.bulkAction(USER_ID, ids.map(String), "delete");
    assert.equal(r.affected, 35);
    assert.deepEqual(r.ids, ids.map(String));
    assert.equal(r.omitidos, 0);
    assert.equal(retractos, 35, "se retiro el precio de cada vino");
    assert.ok(maximo > 1, "corre en paralelo");
    assert.ok(maximo <= 10, `no mas de 10 a la vez (fueron ${maximo})`);
  });
});

test("convertir deseo ya no existe: ni ruta ni servicio", () => {
  assert.equal(wishesService.convertWishToWine, undefined);
  const rutas = wishesRoutes.stack.map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
  assert.ok(!rutas.some((r) => r.includes("convert")), rutas.join(", "));
});
