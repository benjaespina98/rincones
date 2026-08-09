const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const User = require("../src/models/user.model");
const ChangeLog = require("../src/models/changeLog.model");
const communityWines = require("../src/services/communityWines.service");
const imageStorage = require("../src/services/imageStorage.service");
const winesService = require("../src/services/wines.service");

/**
 * El diario tiene que sobrevivir al inventario.
 *
 * Los momentos apuntaban al vino sólo por id, así que borrar la botella de Mi
 * Bodega dejaba el recuerdo sin nombre: quedaba la fecha, con quién estabas y
 * qué comiste, pero no QUÉ TOMASTE. La entrada seguía existiendo y era ilegible,
 * que es la peor de las dos opciones — o se conserva entera o no se conserva.
 *
 * Son dos cosas distintas y las dos se prueban acá: que el momento se escriba
 * con el vino adentro, y que borrar el vino no se lleve puesto el diario.
 */

const USER_ID = new mongoose.Types.ObjectId();

const stubEntorno = ({ wine = null, moments = [] } = {}) => {
  const originales = {
    wineFindOne: Wine.findOne,
    wineDeleteOne: Wine.deleteOne,
    momentCreate: WineMoment.create,
    momentFind: WineMoment.find,
    momentUpdateMany: WineMoment.updateMany,
    momentCount: WineMoment.countDocuments,
    userFindById: User.findById,
    store: imageStorage.store,
    contribute: communityWines.contribute,
    retract: communityWines.retract,
    changeLog: ChangeLog.create,
  };

  // La auditoría escribe en Mongo y su error se traga en un try/catch, así que
  // sin conexión no falla: ESPERA los diez segundos del buffering de mongoose.
  // Sin este stub, cada borrado le suma diez segundos a la suite por nada.
  ChangeLog.create = async () => ({});

  const registro = { creados: [], updateMany: [], borrados: 0, retract: 0 };

  User.findById = async () => ({
    _id: USER_ID,
    email: "a@b.c",
    role: "user",
    stats: { winesCount: 1, tastedWines: 1 },
    save: async () => {},
  });
  Wine.findOne = async () => wine;
  Wine.deleteOne = async () => {
    registro.borrados += 1;
    return { deletedCount: 1 };
  };
  WineMoment.create = async (doc) => {
    registro.creados.push(doc);
    return { ...doc, _id: new mongoose.Types.ObjectId() };
  };
  WineMoment.countDocuments = async () => moments.length;
  WineMoment.updateMany = (filtro, cambio) => {
    registro.updateMany.push({ filtro, cambio });
    return { catch: () => Promise.resolve() };
  };
  WineMoment.find = () => ({
    sort: () => ({ limit: () => ({ lean: async () => moments }) }),
  });
  imageStorage.store = async (v) => v;
  communityWines.contribute = async () => {};
  communityWines.retract = async () => {
    registro.retract += 1;
  };

  return {
    registro,
    restore: () => {
      Wine.findOne = originales.wineFindOne;
      Wine.deleteOne = originales.wineDeleteOne;
      WineMoment.create = originales.momentCreate;
      WineMoment.find = originales.momentFind;
      WineMoment.updateMany = originales.momentUpdateMany;
      WineMoment.countDocuments = originales.momentCount;
      User.findById = originales.userFindById;
      imageStorage.store = originales.store;
      communityWines.contribute = originales.contribute;
      communityWines.retract = originales.retract;
      ChangeLog.create = originales.changeLog;
    },
  };
};

const unVino = () => {
  const w = new Wine({
    userId: USER_ID,
    name: "Perro Callejero",
    winery: "Mosquita Muerta Wines",
    varietal: "Malbec",
    type: "red",
    image: "https://cdn/foto.jpg",
    quantity: 2,
    tasted: true,
  });
  w.save = async function save() { return this; };
  return w;
};

test("un momento se escribe con el vino adentro", async () => {
  const wine = unVino();
  const env = stubEntorno({ wine });
  try {
    await winesService.addMoment(USER_ID, "wine-1", {
      occasion: "cena",
      companions: "Ana",
      notes: "Con milanesas",
    });

    const creado = env.registro.creados[0];
    assert.ok(creado.wineSnapshot, "el momento tiene que guardar de qué vino era");
    assert.equal(creado.wineSnapshot.name, "Perro Callejero");
    assert.equal(creado.wineSnapshot.winery, "Mosquita Muerta Wines");
    assert.equal(creado.wineSnapshot.varietal, "Malbec");
  } finally {
    env.restore();
  }
});

test("borrar el vino NO borra los momentos, y los deja legibles", async () => {
  const wine = unVino();
  const env = stubEntorno({ wine, moments: [{ _id: "m1" }, { _id: "m2" }] });
  try {
    const ok = await winesService.deleteWine(USER_ID, "wine-1");
    assert.equal(ok, true);
    assert.equal(env.registro.borrados, 1, "el vino sí se borra");

    // Los momentos viejos —de antes de que existiera el snapshot— se completan
    // en el último instante en que todavía sabemos qué vino era.
    const relleno = env.registro.updateMany[0];
    assert.ok(relleno, "hay que rellenar los snapshots que falten antes de borrar");
    assert.equal(relleno.cambio.$set.wineSnapshot.name, "Perro Callejero");
    assert.equal(String(relleno.filtro.wineId), String(wine._id));
  } finally {
    env.restore();
  }
});

test("borrar de tu bodega NO retira el vino del catálogo público", async () => {
  // Borrar significa "ya no lo tengo", no "esto que cargué estaba mal". Sólo lo
  // segundo desmiente un dato, y de eso se encarga `updateWine`. Un vino que
  // existe sigue existiendo aunque vos te lo hayas terminado.
  const wine = unVino();
  const env = stubEntorno({ wine });
  try {
    await winesService.deleteWine(USER_ID, "wine-1");
    assert.equal(env.registro.retract, 0);
  } finally {
    env.restore();
  }
});

test("el diario cae al snapshot cuando el vino ya no está", async () => {
  const wineId = new mongoose.Types.ObjectId();
  const momentos = [
    {
      _id: "m1",
      wineId,
      consumedAt: new Date(),
      wineSnapshot: { name: "Perro Callejero", winery: "Mosquita Muerta Wines", type: "red" },
    },
  ];
  const env = stubEntorno({ moments: momentos });

  const originalFind = Wine.find;
  // La bodega ya no tiene ese vino: es el caso de después de borrarlo.
  Wine.find = () => ({ select: () => ({ lean: async () => [] }) });

  try {
    const salida = await winesService.getAllMoments(USER_ID);

    assert.equal(salida.length, 1);
    assert.equal(salida[0].enBodega, false, "hay que poder saber que ya no está");
    assert.equal(
      salida[0].wine.name,
      "Perro Callejero",
      "pero el recuerdo tiene que seguir diciendo qué tomaste"
    );
    assert.equal(salida[0].wine._id, null, "sin id: no hay ficha adonde ir");
  } finally {
    Wine.find = originalFind;
    env.restore();
  }
});

test("con el vino en la bodega manda la ficha, no el snapshot", async () => {
  // El snapshot es el respaldo. Mientras el vino exista, sus datos actuales son
  // los buenos: si le corregiste la bodega o le cambiaste la foto, el diario
  // tiene que mostrar lo corregido.
  const wineId = new mongoose.Types.ObjectId();
  const momentos = [
    {
      _id: "m1",
      wineId,
      consumedAt: new Date(),
      wineSnapshot: { name: "Pispi", winery: "Pispi", type: "red" },
    },
  ];
  const env = stubEntorno({ moments: momentos });

  const originalFind = Wine.find;
  Wine.find = () => ({
    select: () => ({
      lean: async () => [{ _id: wineId, name: "Pispi", winery: "Mosquita Muerta Wines", type: "red" }],
    }),
  });

  try {
    const salida = await winesService.getAllMoments(USER_ID);
    assert.equal(salida[0].enBodega, true);
    assert.equal(salida[0].wine.winery, "Mosquita Muerta Wines");
  } finally {
    Wine.find = originalFind;
    env.restore();
  }
});
