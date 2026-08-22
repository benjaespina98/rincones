const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const WinePrice = require("../src/models/winePrice.model");
const winePrices = require("../src/services/winePrices.service");

// Ids reales: `samples.user` es un ObjectId y con strings inventados mongoose
// descarta el valor en silencio — la prueba pasaría a medir el casteo.
const ana = new mongoose.Types.ObjectId();
const beto = new mongoose.Types.ObjectId();
const caro = new mongoose.Types.ObjectId();

/**
 * El promedio de lo que pagó la gente.
 *
 * ── QUÉ SOSTIENEN ESTAS PRUEBAS ─────────────────────────────────────────────
 * El pool guardaba `sum` y `count` sin dueño, y eso hacía que el promedio fuera
 * imposible de corregir: cada aporte era anónimo y definitivo. Los tres
 * síntomas que se arreglaron —y que están medidos acá uno por uno— eran que
 * corregir tu precio te contaba dos veces, que borrar el vino dejaba tu precio
 * adentro para siempre, y que un vino cargado sólo por vos te devolvía tu propio
 * precio disfrazado de "promedio de la comunidad".
 */

const fakeDb = () => {
  const filas = new Map(); // _id → documento
  const originales = { findOne: WinePrice.findOne, deleteOne: WinePrice.deleteOne };

  const buscar = (key) => [...filas.values()].find((d) => d.key === key) || null;

  WinePrice.findOne = (q) => {
    const doc = buscar(q.key);
    // El servicio usa `.lean()` para leer y el documento pelado para escribir.
    const p = Promise.resolve(doc);
    p.lean = async () => (doc ? JSON.parse(JSON.stringify(doc.toObject())) : null);
    return p;
  };
  WinePrice.deleteOne = async (q) => {
    filas.delete(q._id);
    return { deletedCount: 1 };
  };

  let siguiente = 1;
  const originalSave = WinePrice.prototype.save;
  WinePrice.prototype.save = async function save() {
    if (!this._id) this._id = `id-${siguiente++}`;
    filas.set(this._id, this);
    return this;
  };

  return {
    filas,
    get: (key) => buscar(key),
    restore: () => {
      WinePrice.findOne = originales.findOne;
      WinePrice.deleteOne = originales.deleteOne;
      WinePrice.prototype.save = originalSave;
    },
  };
};

const NICASIA = { name: "Nicasia Vineyards", winery: "Catena Zapata", varietal: "Blend" };

test("corregir tu precio te pisa la muestra, no suma una segunda", async () => {
  const db = fakeDb();
  try {
    await winePrices.contribute({ ...NICASIA, price: 9800, userId: ana });
    await winePrices.contribute({ ...NICASIA, price: 12000, userId: ana });

    const pool = db.get(winePrices.wineKey(NICASIA.name, NICASIA.winery, NICASIA.varietal));
    assert.equal(pool.count, 1, "una persona es una muestra, corrija las veces que corrija");
    assert.equal(pool.sum, 12000, "vale el último precio que cargó");
  } finally {
    db.restore();
  }
});

test("el promedio sale de todas las personas y excluye a quien pregunta", async () => {
  const db = fakeDb();
  try {
    await winePrices.contribute({ ...NICASIA, price: 10000, userId: ana });
    await winePrices.contribute({ ...NICASIA, price: 14000, userId: beto });
    await winePrices.contribute({ ...NICASIA, price: 12000, userId: caro });

    const todos = await winePrices.getPrice(NICASIA.name, NICASIA.winery, NICASIA.varietal);
    assert.equal(todos.count, 3);
    assert.equal(todos.avg, 12000);
    assert.equal(todos.min, 10000);
    assert.equal(todos.max, 14000);

    // Lo que ve Ana: el precio de los OTROS. Es la razón por la que la ficha
    // puede poner "vos pagaste $10.000" al lado sin repetirse.
    const paraAna = await winePrices.getPrice(NICASIA.name, NICASIA.winery, NICASIA.varietal, ana);
    assert.equal(paraAna.count, 2);
    assert.equal(paraAna.avg, 13000);
  } finally {
    db.restore();
  }
});

test("un vino que cargaste sólo vos no tiene precio de mercado", async () => {
  const db = fakeDb();
  try {
    await winePrices.contribute({ ...NICASIA, price: 9800, userId: ana });

    assert.equal(
      await winePrices.getPrice(NICASIA.name, NICASIA.winery, NICASIA.varietal, ana),
      null,
      "sacando tu muestra no queda ninguna: no hay promedio que mostrar"
    );
  } finally {
    db.restore();
  }
});

test("retirar tu muestra la saca del promedio, y la última borra el pool", async () => {
  const db = fakeDb();
  const key = winePrices.wineKey(NICASIA.name, NICASIA.winery, NICASIA.varietal);
  try {
    await winePrices.contribute({ ...NICASIA, price: 10000, userId: ana });
    await winePrices.contribute({ ...NICASIA, price: 20000, userId: beto });

    await winePrices.retract({ ...NICASIA, userId: beto });
    assert.equal(db.get(key).count, 1);
    assert.equal(db.get(key).sum, 10000);

    await winePrices.retract({ ...NICASIA, userId: ana });
    assert.equal(db.get(key), null, "sin muestras el pool no existe, no vale cero");
  } finally {
    db.restore();
  }
});

test("sin dueño no se aporta: un precio anónimo no se podría corregir después", async () => {
  const db = fakeDb();
  try {
    await winePrices.contribute({ ...NICASIA, price: 9800 });
    assert.equal(db.filas.size, 0);
  } finally {
    db.restore();
  }
});
