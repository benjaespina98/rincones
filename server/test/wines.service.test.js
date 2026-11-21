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

const restore = (object, key, value) => {
  object[key] = value;
};

/**
 * ── POR QUÉ ESTO SE STUBEA UNA SOLA VEZ, ACÁ ARRIBA ─────────────────────────
 *
 * `createWine`/`updateWine`/`deleteWine` dejan, al pasar, un rastro en varios
 * lugares que este archivo no está probando: la auditoría (`ChangeLog`, vía
 * `logChange`), el banco de fotos (`wineImages.getImage`), el catálogo
 * comunitario (`communityWines.contribute`) y —al borrar— los momentos
 * huérfanos (`WineMoment.updateMany`). Sin mongoose conectado (esta suite no
 * lo conecta, ver wineIdentification.test.js) esas llamadas no fallan:
 * ESPERAN el timeout de buffering de mongoose, ~10s cada una. Cuatro tests de
 * este archivo las disparaban sin saberlo y sumaban cerca de un minuto muerto
 * a cada corrida — silencioso, porque `logChange` y `wineImages`/
 * `communityWines`/`winePrices` tragan sus propios errores y el test
 * terminaba pasando igual, sólo que diez, veinte o treinta segundos después.
 *
 * Nada de esto se restaura: ningún test de ESTE archivo lee el resultado real
 * de estas llamadas (para eso están communityWines.test.js y las pruebas de
 * wineIdentification.test.js, que sí las verifican).
 */
// Los contadores del perfil se ajustan con un update atómico (pipeline): se anotan para poder mirarlos.
const statsLlamadas = [];
User.updateOne = async (filtro, pipeline, opts) => {
  statsLlamadas.push({ filtro, pipeline, opts });
  return { modifiedCount: 1 };
};
/** El delta que pidió la última llamada para `stats.<campo>` (0 si no lo tocó). */
const deltaStats = (llamada, campo) =>
  llamada?.pipeline?.[0]?.$set?.[`stats.${campo}`]?.$max?.[1]?.$add?.[1] ?? 0;
const sumaStats = (campo) => statsLlamadas.reduce((n, l) => n + deltaStats(l, campo), 0);

ChangeLog.create = async () => ({});
ChangeLog.insertMany = async () => [];
WineMoment.updateMany = async () => ({ modifiedCount: 0 });
communityWines.contribute = async () => {};
wineImages.getImage = async () => "";
wineImages.contribute = async () => {};
winePrices.contribute = async () => {};
winePrices.retract = async () => {};
communityWines.retract = async () => {};

test("wines service creates a wine and updates user stats", async () => {
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const originalStats = { ...Wine.schema.paths };

  let savedUser = false;
  const user = { stats: { winesCount: 0, tastedWines: 0 }, save: async () => { savedUser = true; } };
  statsLlamadas.length = 0;

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
    // El contador se ajusta con un $inc atómico (pipeline), no leyendo y guardando el usuario.
    assert.equal(statsLlamadas.length, 1);
    assert.equal(statsLlamadas[0].opts.updatePipeline, true);
    assert.equal(deltaStats(statsLlamadas[0], "winesCount"), 1);
    assert.equal(deltaStats(statsLlamadas[0], "tastedWines"), 1);
    assert.equal(savedUser, false, "ya no hay lectura-modificación-escritura del usuario");
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
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;

  const user = { stats: { winesCount: 1, tastedWines: 1 }, save: async () => {} };
  statsLlamadas.length = 0;
  User.findById = async () => user;
  Wine.prototype.save = async function save() { return this; };
  Wine.deleteOne = async () => ({ deletedCount: 1 });

  // `updateWine` valida el documento antes de guardar: el dueño tiene que ser un ObjectId real.
  const existingWine = new Wine({
    userId: new mongoose.Types.ObjectId(),
    name: "Cabernet",
    quantity: 3,
    tasted: true,
    status: "tasted",
  });
  existingWine.save = async function save() { return this; };
  Wine.findOne = async () => existingWine;
  // La cantidad se fija con el pipeline atómico (no con save()): se simula su resultado.
  Wine.findOneAndUpdate = async () => Object.assign(existingWine, { quantity: 5 });

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
    assert.equal(sumaStats("winesCount"), -1);
    assert.equal(sumaStats("tastedWines"), 0, "el updateWine previo lo dejó sin probar: no baja probados");
    assert.equal(statsLlamadas.at(-1).opts.updatePipeline, true);
  } finally {
    restore(Wine, "findOne", originalFindOne);
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalFindById);
    restore(Wine, "deleteOne", originalDeleteOne);
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
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

/**
 * El vino que tomaste afuera: entra al historial sin inventar una compra.
 *
 * Antes el alta forzaba un mínimo de una botella (`Math.max(1, …)`), así que
 * registrar que tomaste un vino en un restaurante te dejaba una botella de más
 * en la cava y había que restarla a mano después. Cero es una cantidad válida, y
 * sobre un vino que ya tenías significa "me tomé uno, pero no de los míos".
 */
test("cargar con CERO botellas no toca el stock: sólo deja escrito que lo tomaste", async () => {
  const originalFind = Wine.find;
  const originalFindOneAndUpdate = Wine.findOneAndUpdate;
  const originalUserFindById = User.findById;

  // Tenés 2 botellas guardadas y nunca lo habías marcado como probado.
  const existente = {
    _id: "w9",
    name: "Pispi",
    winery: "Mosquita Muerta Wines",
    varietal: "Blend",
    vintage: 2023,
    quantity: 2,
    tasted: false,
    status: "stock",
  };

  let update = null;
  Wine.find = () => ({ select: async () => [existente] });
  Wine.findOneAndUpdate = async (_filtro, cambio) => {
    update = cambio;
    return { ...existente, tasted: true, status: "tasted" };
  };
  User.findById = async () => ({ stats: {}, save: async () => {} });

  try {
    const { wine, merged, added } = await winesService.createWine("user-1", {
      name: "Pispi",
      winery: "Mosquita Muerta Wines",
      varietal: "Blend",
      vintage: "2023",
      quantity: 0,
    });

    assert.equal(merged, true);
    assert.equal(added, 0, "no entró ninguna botella");
    assert.equal(wine.tasted, true, "queda registrado que lo tomaste");

    // Lo que importa es lo que NO está: ni lote nuevo, ni suma de stock.
    const json = JSON.stringify(update);
    assert.ok(!json.includes("$concatArrays"), "no se abre un lote de compra");
    assert.ok(!json.includes("quantity"), "el stock no se toca en ningún sentido");
    assert.ok(json.includes("lastConsumedAt"), "sí queda la fecha en que lo tomaste");
  } finally {
    restore(Wine, "find", originalFind);
    restore(Wine, "findOneAndUpdate", originalFindOneAndUpdate);
    restore(User, "findById", originalUserFindById);
  }
});

/**
 * El mismo hecho, con un vino que NO tenías: la copa que tomaste afuera de algo
 * que no está en tu cava.
 *
 * Es el gemelo del test de arriba y hacía falta porque los dos caminos del alta
 * escribían cosas distintas ante la misma carga. El de reposición dejaba el vino
 * probado, con fecha y con un consumo; el de vino nuevo dejaba sólo `tasted`, así
 * que ese vino aparecía entre los probados pero sin última vez ni consumos —y
 * cualquier pantalla que mirara esos campos contaba una historia distinta según
 * si la botella ya estaba en tu bodega o no.
 *
 * Lo que NO tiene que quedar es un lote: es lo que después permite distinguir un
 * vino que nunca fue tuyo de uno que tuviste y se te terminó.
 */
test("un vino NUEVO cargado como tomado afuera queda probado, con su fecha y sin lote", async () => {
  const originalFind = Wine.find;
  const originalSave = Wine.prototype.save;
  const originalUserFindById = User.findById;

  const user = { stats: { winesCount: 0, tastedWines: 0 }, save: async () => {} };
  statsLlamadas.length = 0;
  // No lo tenías: no hay reposición posible.
  Wine.find = () => ({ select: async () => [] });
  // El `save` de mentira NO corre los hooks del modelo, así que los lotes se
  // miran como lo que el alta escribió (nada) y no como lo que dejaría el hook.
  Wine.prototype.save = async function save() { return this; };
  User.findById = async () => user;

  try {
    const { wine, merged } = await winesService.createWine("user-1", {
      name: "Refugio Alto",
      winery: "Bodega Los Cardones",
      varietal: "Bonarda",
      quantity: 0,
    });

    assert.equal(merged, false);
    assert.equal(wine.quantity, 0, "no entró ninguna botella a la cava");
    assert.equal(wine.tasted, true, "lo tomaste: eso es lo que se está registrando");
    assert.equal(wine.consumptionCount, 1, "y cuenta como una vez que lo tomaste");
    assert.ok(wine.lastConsumedAt, "con su fecha, igual que por el camino de reposición");
    assert.equal(
      (wine.lots || []).length,
      0,
      "sin compra no hay lote: nunca estuvo en tu cava"
    );
    assert.equal(sumaStats("tastedWines"), 1, "y suma a tus probados del perfil");
  } finally {
    restore(Wine, "find", originalFind);
    restore(Wine.prototype, "save", originalSave);
    restore(User, "findById", originalUserFindById);
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

  const vino = new Wine({ userId: new mongoose.Types.ObjectId(), name: "Saint Felicien", quantity: 2, tasted: false });
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

/**
 * ── ACCIONES EN LOTE ────────────────────────────────────────────────────────
 * Es la parte de la app donde un error cuesta más caro: una petición borra
 * muchos vinos de una. Lo que se prueba acá es lo que no se ve leyendo el código:
 * que el userId viaje SIEMPRE en el filtro (y no como una verificación previa
 * que alguien puede olvidar), que haya un techo, y que el número que se le
 * informa al usuario sea el que la base cambió de verdad.
 */

const conMock = async (objeto, clave, reemplazo, fn) => {
  const original = objeto[clave];
  objeto[clave] = reemplazo;
  try {
    return await fn();
  } finally {
    restore(objeto, clave, original);
  }
};

// El borrado en lote ahora completa los momentos y retira precios: se anulan para los tests que no miran eso.
const sinEfectos = (fn) =>
  conMock(WineMoment, "updateMany", async () => ({}), () =>
    conMock(winePrices, "retract", async () => {}, fn)
  );

const ID_1 = "507f1f77bcf86cd799439011";
const ID_2 = "507f1f77bcf86cd799439012";

test("el lote filtra SIEMPRE por dueño: no alcanza con mandar un id ajeno", async () => {
  let filtroUsado = null;
  const original = User.findById;
  User.findById = async () => null;

  try {
    await conMock(Wine, "updateMany", async (filtro) => {
      filtroUsado = filtro;
      return { modifiedCount: 2 };
    }, () => winesService.bulkAction("user-1", [ID_1, ID_2], "tasted"));
  } finally {
    restore(User, "findById", original);
  }

  assert.equal(filtroUsado.userId, "user-1", "el dueño va en la consulta, no en un if aparte");
  assert.deepEqual(filtroUsado._id.$in, [ID_1, ID_2]);
});

test("el lote devuelve lo que CAMBIÓ, no lo que se mandó", async () => {
  const original = User.findById;
  User.findById = async () => null;

  try {
    // Se mandan dos, pero uno ya estaba marcado: informar "2 marcados" sería
    // contarle al usuario un trabajo que no se hizo.
    const r = await conMock(Wine, "updateMany", async () => ({ modifiedCount: 1 }), () =>
      winesService.bulkAction("user-1", [ID_1, ID_2], "favorite")
    );
    assert.equal(r.affected, 1);
  } finally {
    restore(User, "findById", original);
  }
});

test("el lote descarta ids inválidos, duplicados y lo que pase del tope", async () => {
  let filtroUsado = null;
  const original = User.findById;
  User.findById = async () => null;

  const muchos = Array.from({ length: winesService.MAX_EN_LOTE + 40 }, (_, i) =>
    `507f1f77bcf86cd7994${String(390 + i).padStart(5, "0")}`.slice(0, 24)
  );

  try {
    await conMock(Wine, "updateMany", async (filtro) => {
      filtroUsado = filtro;
      return { modifiedCount: 0 };
    }, () => winesService.bulkAction("user-1", [ID_1, ID_1, "no-es-un-id", null, ...muchos], "tasted"));
  } finally {
    restore(User, "findById", original);
  }

  const ids = filtroUsado._id.$in;
  assert.ok(ids.length <= winesService.MAX_EN_LOTE, "hay un techo");
  assert.equal(ids.filter((i) => i === ID_1).length, 1, "el mismo id no va dos veces");
  assert.ok(!ids.includes("no-es-un-id"), "lo que no es un id no llega a la consulta");
});

test("una acción inventada no hace nada y se puede distinguir de 'no cambió ninguno'", async () => {
  // Devuelve null (≠ { affected: 0 }) para que el controlador conteste 400 y no
  // un éxito silencioso: pedir algo que no existe no es lo mismo que pedir algo
  // que no tuvo efecto.
  const r = await winesService.bulkAction("user-1", [ID_1], "formatear-todo");
  assert.equal(r, null);
});

test("borrar en lote no toca vinos de otro y ajusta las estadísticas una sola vez", async () => {
  const user = { stats: { winesCount: 10, tastedWines: 4 }, save: async () => {} };
  const originalFindById = User.findById;
  User.findById = async () => user;
  statsLlamadas.length = 0;

  let filtroBorrado = null;

  try {
    const r = await conMock(Wine, "find", () => ({
      select: () => ({
        lean: async () => [
          { _id: ID_1, name: "A", winery: "X", tasted: true },
          { _id: ID_2, name: "B", winery: "Y", tasted: false },
        ],
      }),
    }), () =>
      conMock(Wine, "deleteMany", async (filtro) => {
        filtroBorrado = filtro;
        return { deletedCount: 2 };
      }, () => sinEfectos(() => winesService.bulkAction("user-1", [ID_1, ID_2], "delete")))
    );

    assert.equal(r.affected, 2);
    assert.equal(filtroBorrado.userId, "user-1");
    assert.equal(sumaStats("winesCount"), -2, "bajan los dos");
    assert.equal(sumaStats("tastedWines"), -1, "sólo baja el que estaba probado");
    assert.deepEqual(r.inexistentes, []);
  } finally {
    restore(User, "findById", originalFindById);
  }
});

/**
 * ── LA AUDITORÍA DEL BORRADO EN LOTE, DE UNA SOLA VEZ ───────────────────────
 * Antes era `for (const w of vinos) await logChange(...)`: hasta MAX_EN_LOTE
 * (200) vinos borrados de una eran hasta 200 escrituras a `ChangeLog`, cada
 * una esperando a que termine la anterior — el borrado en sí ya había
 * pasado, así que esa espera no protegía nada, sólo alargaba la respuesta.
 * Ahora es un `insertMany`: un solo viaje, con un documento por vino.
 */
test("la auditoría del borrado en lote es un solo insertMany, con un documento por vino", async () => {
  const user = { _id: "u1", email: "vos@rincones.app", role: "user", stats: { winesCount: 2, tastedWines: 1 }, save: async () => {} };
  const originalFindById = User.findById;
  User.findById = async () => user;

  let insertados = null;

  try {
    await conMock(Wine, "find", () => ({
      select: () => ({
        lean: async () => [
          { _id: ID_1, name: "A", winery: "X", tasted: true },
          { _id: ID_2, name: "B", winery: "Y", tasted: false },
        ],
      }),
    }), () =>
      conMock(Wine, "deleteMany", async () => ({ deletedCount: 2 }), () =>
        conMock(ChangeLog, "insertMany", async (docs) => {
          insertados = docs;
          return docs;
        }, () => sinEfectos(() => winesService.bulkAction("user-1", [ID_1, ID_2], "delete")))
      )
    );

    assert.equal(insertados.length, 2, "un documento por vino, no uno por lote");
    assert.equal(insertados[0].action, "delete");
    assert.equal(insertados[0].entityId, ID_1);
    assert.equal(insertados[0].before.name, "A");
    assert.equal(insertados[1].entityId, ID_2);
    assert.equal(insertados[0].actor.email, "vos@rincones.app", "el actor es quien borró, no el vino");
  } finally {
    restore(User, "findById", originalFindById);
  }
});

test("si la auditoría del borrado en lote falla, el borrado ya hecho no se deshace", async () => {
  const user = { stats: { winesCount: 2, tastedWines: 1 }, save: async () => {} };
  const originalFindById = User.findById;
  User.findById = async () => user;

  try {
    const r = await conMock(Wine, "find", () => ({
      select: () => ({
        lean: async () => [{ _id: ID_1, name: "A", winery: "X", tasted: true }],
      }),
    }), () =>
      conMock(Wine, "deleteMany", async () => ({ deletedCount: 1 }), () =>
        conMock(ChangeLog, "insertMany", async () => { throw new Error("caído"); }, () =>
          sinEfectos(() => winesService.bulkAction("user-1", [ID_1], "delete"))
        )
      )
    );

    assert.equal(r.affected, 1, "el borrado ya había pasado: no depende de que la auditoría escriba");
  } finally {
    restore(User, "findById", originalFindById);
  }
});

test("borrar en lote completa wineSnapshot de los momentos y retira el precio comunitario, como deleteWine", async () => {
  const user = { _id: "u1", email: "a@b.c", role: "user", stats: { winesCount: 5, tastedWines: 0 }, save: async () => {} };
  const originalFindById = User.findById;
  User.findById = async () => user;

  const snapshots = [];
  const retirados = [];
  let seleccion = "";

  try {
    await conMock(Wine, "find", () => ({
      select: (campos) => {
        seleccion = campos;
        return {
          lean: async () => [
            { _id: ID_1, name: "A", winery: "X", varietal: "Malbec", type: "tinto", image: "u.jpg", tasted: false, purchase: { price: 100 } },
            { _id: ID_2, name: "B", winery: "Y", tasted: false },
          ],
        };
      },
    }), () =>
      conMock(Wine, "deleteMany", async () => ({ deletedCount: 2 }), () =>
        conMock(ChangeLog, "insertMany", async () => [], () =>
          conMock(WineMoment, "updateMany", async (filtro, cambio) => {
            snapshots.push({ filtro, cambio });
            return {};
          }, () =>
            conMock(winePrices, "retract", async (datos) => { retirados.push(datos); }, () =>
              winesService.bulkAction("user-1", [ID_1, ID_2], "delete")
            )
          )
        )
      )
    );

    assert.match(seleccion, /varietal/);
    assert.match(seleccion, /purchase.price/);
    assert.equal(snapshots.length, 2, "un update de momentos por vino");
    assert.equal(snapshots[0].filtro.userId, "user-1");
    assert.equal(snapshots[0].filtro.wineId, ID_1);
    assert.deepEqual(snapshots[0].cambio.$set.wineSnapshot, {
      name: "A", winery: "X", varietal: "Malbec", type: "tinto", image: "u.jpg",
    });
    assert.equal(retirados.length, 1, "sólo el vino con precio retira");
    assert.deepEqual(retirados[0], { name: "A", winery: "X", varietal: "Malbec", userId: "user-1" });
  } finally {
    restore(User, "findById", originalFindById);
  }
});

/**
 * Precondiciones de adjustStock: abrir sin botellas, deshacer sin apertura y
 * deshacer fuera de orden. Van en el filtro del update (atómicas con la escritura).
 */
const conStock = async (fn) => {
  const o = { foau: Wine.findOneAndUpdate, findOne: Wine.findOne, exists: Wine.exists, ufind: User.findById };
  User.findById = async () => ({ stats: { tastedWines: 0 }, save: async () => {} });
  Wine.findOne = () => ({ select: async () => ({ tasted: false }) });
  try {
    await fn();
  } finally {
    Wine.findOneAndUpdate = o.foau;
    Wine.findOne = o.findOne;
    Wine.exists = o.exists;
    User.findById = o.ufind;
  }
};

test("abrir una botella exige stock: el filtro pide quantity >= 1", async () => {
  await conStock(async () => {
    let filtro;
    Wine.findOneAndUpdate = async (f) => { filtro = f; return { _id: "w1", tasted: true }; };
    await winesService.adjustStock("u1", "w1", { delta: -1, markTasted: true });
    assert.deepEqual(filtro.quantity, { $gte: 1 });
  });
});

test("abrir sin botellas responde conflicto (409), no suma un consumo de la nada", async () => {
  await conStock(async () => {
    Wine.findOneAndUpdate = async () => null; // el filtro no matcheó
    Wine.exists = async () => ({ _id: "w1" }); // pero el vino es tuyo
    await assert.rejects(
      () => winesService.adjustStock("u1", "w1", { delta: -1, markTasted: true }),
      (e) => e.codigo === "CONFLICTO_DE_STOCK"
    );
  });
});

test("un vino que no es tuyo sigue siendo 404 (null), no 409", async () => {
  await conStock(async () => {
    Wine.findOneAndUpdate = async () => null;
    Wine.exists = async () => null;
    const r = await winesService.adjustStock("u1", "ajeno", { delta: -1, markTasted: true });
    assert.equal(r, null);
  });
});

test("deshacer una apertura exige un consumo previo", async () => {
  await conStock(async () => {
    let filtro;
    Wine.findOneAndUpdate = async (f) => { filtro = f; return { _id: "w1" }; };
    await winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: false });
    assert.deepEqual(filtro.consumptionCount, { $gte: 1 });

    Wine.findOneAndUpdate = async () => null;
    Wine.exists = async () => ({ _id: "w1" });
    await assert.rejects(
      () => winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: false }),
      (e) => e.codigo === "CONFLICTO_DE_STOCK"
    );
  });
});

test("deshacer una reposición exige tener esas botellas", async () => {
  await conStock(async () => {
    let filtro;
    Wine.findOneAndUpdate = async (f) => { filtro = f; return { _id: "w1" }; };
    await winesService.adjustStock("u1", "w1", { delta: -2, undoRestock: true });
    assert.deepEqual(filtro.quantity, { $gte: 2 });
  });
});

test("deshacer fuera de orden: sigue probado sólo si quedan MÁS consumos que antes de abrir", async () => {
  await conStock(async () => {
    let pipeline;
    Wine.findOneAndUpdate = async (_f, stages) => { pipeline = stages; return { _id: "w1", tasted: true }; };

    // Abriste A y B desde 0 consumos y deshacés A: queda 1 > 0, sigue probado.
    await winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: false, consumosAntes: 0 });
    assert.equal(JSON.stringify(pipeline[0].$set.tasted.$gt[1]), "0");
    assert.ok(JSON.stringify(pipeline[0].$set.tasted).includes("$gt"));

    // Un vino destildado con 3 consumos viejos: tras deshacer vuelven a 3, que NO es más que 3.
    await winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: false, consumosAntes: 3 });
    assert.equal(pipeline[0].$set.tasted.$gt[1], 3);

    // Cliente viejo (sin consumosAntes): manda wasTasted, como siempre.
    await winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: false });
    assert.equal(pipeline[0].$set.tasted, false);

    await winesService.adjustStock("u1", "w1", { delta: 1, undoOpen: true, wasTasted: true, consumosAntes: 3 });
    assert.equal(pipeline[0].$set.tasted, true, "si ya estaba probado antes, queda probado");
  });
});

test("abrir n botellas exige tener n: el filtro pide quantity >= n, no >= 1", async () => {
  await conStock(async () => {
    let filtro;
    Wine.findOneAndUpdate = async (f) => { filtro = f; return { _id: "w1", tasted: true }; };
    await winesService.adjustStock("u1", "w1", { delta: -3, markTasted: true });
    assert.deepEqual(filtro.quantity, { $gte: 3 });
  });
});

test("deshacer una reposición sin botellas para quitar responde conflicto con su mensaje", async () => {
  await conStock(async () => {
    Wine.findOneAndUpdate = async () => null;
    Wine.exists = async () => ({ _id: "w1" });
    await assert.rejects(
      () => winesService.adjustStock("u1", "w1", { delta: -2, undoRestock: true }),
      (e) => e.codigo === "CONFLICTO_DE_STOCK" && /reposición/.test(e.message)
    );
  });
});

test("un descuento común que no encuentra el vino es 404 (null) y no consulta si existe", async () => {
  await conStock(async () => {
    let consultas = 0;
    Wine.findOneAndUpdate = async () => null;
    Wine.exists = async () => { consultas += 1; return { _id: "w1" }; };
    assert.equal(await winesService.adjustStock("u1", "w1", { delta: -1 }), null);
    assert.equal(consultas, 0, "sin precondiciones no hay conflicto posible");
  });
});

test("si se combinan deshacer reposición y abrir, el filtro conserva la exigencia MAYOR", async () => {
  await conStock(async () => {
    let filtro;
    Wine.findOneAndUpdate = async (f) => { filtro = f; return { _id: "w1" }; };
    await winesService.adjustStock("u1", "w1", { delta: -3, undoRestock: true, markTasted: true });
    assert.deepEqual(filtro.quantity, { $gte: 3 });
  });
});

test("un 409 no mueve el contador de probados del perfil", async () => {
  await conStock(async () => {
    const user = { stats: { tastedWines: 5 }, save: async () => { throw new Error("no debía guardar"); } };
    User.findById = async () => user;
    Wine.findOneAndUpdate = async () => null;
    Wine.exists = async () => ({ _id: "w1" });
    await assert.rejects(() => winesService.adjustStock("u1", "w1", { delta: -1, markTasted: true }));
    assert.equal(user.stats.tastedWines, 5);
  });
});

test("la búsqueda acota el largo (100) y los términos (8): una consulta enorme no arma cientos de regex", async () => {
  const original = Wine.find;
  let filtro;
  Wine.find = (f) => { filtro = f; return { sort: () => ({ select: () => ({ lean: async () => [] }) }) }; };
  try {
    await winesService.searchWines("u1", Array.from({ length: 500 }, (_, i) => `t${i}`).join(" "));
  } finally {
    Wine.find = original;
  }
  assert.ok(filtro.$and.length <= 8);
  assert.ok(filtro.$and.length >= 1);
});

// ── Contadores atómicos, deletedCount y fantasmas del lote ──────────────────────────────────────

test("el descuento del borrado usa deletedCount: si otro dispositivo ya lo borró, no baja nada y devuelve null", async () => {
  const o = { findOne: Wine.findOne, deleteOne: Wine.deleteOne, findById: User.findById };
  statsLlamadas.length = 0;
  Wine.findOne = async () => ({ _id: "w1", name: "A", winery: "B", tasted: true });
  Wine.deleteOne = async () => ({ deletedCount: 0 });
  User.findById = async () => ({ _id: "u1", email: "a@b.c", role: "user" });
  WineMoment.updateMany = async () => ({});
  try {
    assert.equal(await winesService.deleteWine("user-1", "w1"), null);
    assert.equal(statsLlamadas.length, 0);
  } finally {
    Wine.findOne = o.findOne;
    Wine.deleteOne = o.deleteOne;
    User.findById = o.findById;
  }
});

test("250 altas en paralelo no pierden contadores: cada una pide un +1 atómico (nada de leer y guardar)", async () => {
  const o = { find: Wine.find, save: Wine.prototype.save, findById: User.findById };
  statsLlamadas.length = 0;
  let guardados = 0;
  Wine.find = () => ({ select: async () => [] });
  Wine.prototype.save = async function save() { return this; };
  User.findById = async () => ({ _id: "u1", email: "a@b.c", role: "user", stats: {}, save: async () => { guardados += 1; } });
  try {
    await Promise.all(
      Array.from({ length: 250 }, (_, i) => winesService.createWine("user-1", { name: "Vino " + i, winery: "W" + i, quantity: 1 }))
    );
    assert.equal(sumaStats("winesCount"), 250);
    assert.equal(guardados, 0);
    assert.ok(statsLlamadas.every((l) => l.opts.updatePipeline === true));
    assert.ok(statsLlamadas.every((l) => String(l.filtro._id) === "user-1"));
  } finally {
    Wine.find = o.find;
    Wine.prototype.save = o.save;
    User.findById = o.findById;
  }
});

test("si el ajuste de contadores falla, el alta ya guardada no se rompe", async () => {
  const o = { find: Wine.find, save: Wine.prototype.save, findById: User.findById, updateOne: User.updateOne, error: console.error };
  Wine.find = () => ({ select: async () => [] });
  Wine.prototype.save = async function save() { return this; };
  User.findById = async () => ({ _id: "u1", email: "a@b.c", role: "user", stats: {}, save: async () => {} });
  User.updateOne = async () => { throw new Error("base caída"); };
  console.error = () => {};
  try {
    const r = await winesService.createWine("user-1", { name: "Resiste", winery: "W", quantity: 1 });
    assert.equal(r.merged, false);
  } finally {
    Wine.find = o.find;
    Wine.prototype.save = o.save;
    User.findById = o.findById;
    User.updateOne = o.updateOne;
    console.error = o.error;
  }
});

test("bulk delete: los ids pedidos que ya no existen vuelven en `ids` y en `inexistentes` (no quedan fantasmas en la UI)", async () => {
  statsLlamadas.length = 0;
  const original = User.findById;
  User.findById = async () => ({ _id: "u1", email: "a@b.c", role: "user" });
  try {
    const r = await conMock(Wine, "find", () => ({
      select: () => ({ lean: async () => [{ _id: ID_1, name: "A", winery: "X", tasted: false }] }),
    }), () =>
      conMock(Wine, "deleteMany", async () => ({ deletedCount: 1 }), () =>
        sinEfectos(() => winesService.bulkAction("user-1", [ID_1, ID_2.toUpperCase(), ID_2], "delete"))
      )
    );
    assert.equal(r.affected, 1);
    assert.deepEqual(r.inexistentes, [ID_2.toUpperCase(), ID_2]);
    assert.deepEqual(r.ids, [ID_1, ID_2.toUpperCase(), ID_2]);
    assert.equal(sumaStats("winesCount"), -1, "sólo baja lo que se borró de verdad");
  } finally {
    User.findById = original;
  }
});

test("bulk delete: si ninguno existe, todos vuelven como inexistentes y no se toca nada", async () => {
  statsLlamadas.length = 0;
  const r = await conMock(Wine, "find", () => ({ select: () => ({ lean: async () => [] }) }), () =>
    winesService.bulkAction("user-1", [ID_1, ID_2], "delete")
  );
  assert.deepEqual(r, { affected: 0, ids: [ID_1, ID_2], inexistentes: [ID_1, ID_2], omitidos: 0 });
  assert.equal(statsLlamadas.length, 0);
});
