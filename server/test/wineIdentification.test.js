const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Wine = require("../src/models/wine.model");
const User = require("../src/models/user.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const winePrices = require("../src/services/winePrices.service");
const imageStorage = require("../src/services/imageStorage.service");
const wineDescription = require("../src/services/wineDescription.service");
const winesService = require("../src/services/wines.service");

/**
 * El puente entre la confianza de la lectura y el catálogo público.
 *
 * Las reglas por separado ya están probadas —`wineValidation.test.js` decide qué
 * vale una lectura, `communityWines.test.js` decide a quién se publica—. Lo que
 * se prueba acá es que el alta y la edición las CONECTEN: que la evidencia que
 * manda el cliente llegue a la decisión, que el veredicto no se acepte del
 * cliente, y que corregir un vino propio arregle también lo público.
 */

/** Intercepta las llamadas al catálogo comunitario para poder mirarlas. */
const spyCatalogo = () => {
  const original = { contribute: communityWines.contribute, retract: communityWines.retract };
  const llamadas = { contribute: [], retract: [] };

  communityWines.contribute = async (wine, opts = {}) => {
    llamadas.contribute.push({ wine, ...opts });
  };
  communityWines.retract = async (wine, opts = {}) => {
    llamadas.retract.push({ wine, ...opts });
  };

  return {
    llamadas,
    restore: () => Object.assign(communityWines, original),
  };
};

/**
 * El entorno mínimo para que `createWine` / `updateWine` corran sin base.
 *
 * Además de los modelos hay que neutralizar los tres servicios que el alta llama
 * al pasar (banco de fotos, precios comunitarios, ficha IA). No es prolijidad:
 * cada uno consulta Mongo, y sin conexión mongoose no falla sino que ESPERA su
 * timeout de buffering. Diez segundos por llamada convierten esta suite en algo
 * que nadie va a correr.
 */
const stubEntorno = (wineExistente = null) => {
  const originales = {
    save: Wine.prototype.save,
    find: Wine.find,
    findOne: Wine.findOne,
    findById: User.findById,
    imgContribute: wineImages.contribute,
    imgGet: wineImages.getImage,
    priceContribute: winePrices.contribute,
    store: imageStorage.store,
    describe: wineDescription.ensureDescription,
  };

  const user = { _id: "u", email: "a@b.c", role: "user", stats: {}, save: async () => {} };
  User.findById = async () => user;
  Wine.prototype.save = async function save() { return this; };
  // `findSameWine` recorre la bodega buscando una reposición: vacía.
  Wine.find = () => ({ select: async () => [] });
  Wine.findOne = async () => wineExistente;

  wineImages.contribute = async () => {};
  wineImages.getImage = async () => "";
  winePrices.contribute = async () => {};
  imageStorage.store = async (v) => v;
  wineDescription.ensureDescription = async () => {};

  return {
    restore: () => {
      Wine.prototype.save = originales.save;
      Wine.find = originales.find;
      Wine.findOne = originales.findOne;
      User.findById = originales.findById;
      wineImages.contribute = originales.imgContribute;
      wineImages.getImage = originales.imgGet;
      winePrices.contribute = originales.priceContribute;
      imageStorage.store = originales.store;
      wineDescription.ensureDescription = originales.describe;
    },
  };
};

const USER_ID = new mongoose.Types.ObjectId();

/**
 * Un vino INVENTADO, que a propósito no está en el catálogo curado.
 *
 * La tentación es usar el caso real que motivó todo esto (el Pispi de Mosquita
 * Muerta), y es justo el que no sirve: ese vino SÍ está en el catálogo curado, y
 * los curados no aportan al comunitario —se evita el gemelo duplicado—. La
 * prueba pasaría sin llegar nunca a la decisión que queremos verificar.
 *
 * (Que el Pispi esté en el catálogo dice algo del bug original, además: la
 * lectura que ponía "Pispi" como bodega hacía que `findMatch` no lo pudiera
 * rescatar, porque su veto duro compara bodega contra bodega y "Pispi" no se
 * parece en nada a "Mosquita Muerta Wines". El enriquecimiento no podía salvar
 * un campo mal asignado; por eso el arreglo tenía que estar antes.)
 */
const LECTURA_BUENA = {
  name: "Refugio Alto",
  line: "Refugio Alto",
  winery: "Bodega Los Cardones",
  varietal: "Bonarda",
  region: "Valle de Uco, Mendoza",
  type: "red",
  vintage: 2019,
  identification: {
    source: "scan",
    confidence: { name: 0, line: 95, winery: 93, varietal: 92, vintage: 90, region: 88, type: 85 },
    editedFields: [],
  },
};

test("una lectura confiable llega al catálogo público como confiable", async () => {
  const spy = spyCatalogo();
  const db = stubEntorno();
  try {
    const { wine } = await winesService.createWine(USER_ID, LECTURA_BUENA);

    assert.equal(wine.identification.verdict, "trusted");
    assert.equal(spy.llamadas.contribute.length, 1);
    assert.equal(spy.llamadas.contribute[0].verdict, "trusted");
    assert.equal(String(spy.llamadas.contribute[0].userId), String(USER_ID));
  } finally {
    spy.restore();
    db.restore();
  }
});

test("una lectura floja entra a la bodega pero NO como confiable", async () => {
  const spy = spyCatalogo();
  const db = stubEntorno();
  try {
    const { wine } = await winesService.createWine(USER_ID, {
      ...LECTURA_BUENA,
      identification: {
        ...LECTURA_BUENA.identification,
        confidence: { ...LECTURA_BUENA.identification.confidence, line: 62, winery: 58 },
      },
    });

    assert.ok(wine._id !== undefined || wine.name, "el vino igual se guarda: es tuyo");
    assert.equal(wine.identification.verdict, "unverified");
    assert.equal(spy.llamadas.contribute[0].verdict, "unverified");
  } finally {
    spy.restore();
    db.restore();
  }
});

test("el veredicto lo decide el servidor, no el cliente", async () => {
  const spy = spyCatalogo();
  const db = stubEntorno();
  try {
    // Un payload armado a mano que se autodeclara confiable, con una lectura que
    // no lo es. Si esto se aceptara, la puerta al catálogo público estaría
    // abierta para cualquiera que sepa escribir un JSON.
    const { wine } = await winesService.createWine(USER_ID, {
      ...LECTURA_BUENA,
      identification: {
        source: "scan",
        verdict: "trusted",
        confidence: { line: 5, winery: 5 },
        editedFields: [],
      },
    });

    assert.equal(
      wine.identification.verdict,
      "doubtful",
      "el `verdict: trusted` que venía en el payload se ignora por completo"
    );
    // Lo que le llega al catálogo es el veredicto RECALCULADO, no el declarado.
    // Que después no escriba nada lo garantiza `contribute`, que es donde vive
    // esa regla y donde se prueba (ver communityWines.test.js).
    assert.equal(spy.llamadas.contribute[0].verdict, "doubtful");
  } finally {
    spy.restore();
    db.restore();
  }
});

test("la uva rota se arregla antes de guardarse", async () => {
  const spy = spyCatalogo();
  const db = stubEntorno();
  try {
    const { wine } = await winesService.createWine(USER_ID, {
      ...LECTURA_BUENA,
      varietal: "Blen",
    });

    assert.equal(wine.varietal, "Blend", "no se guarda la palabra rota");
  } finally {
    spy.restore();
    db.restore();
  }
});

test("corregir la bodega retira la identidad vieja y aporta la nueva", async () => {
  const spy = spyCatalogo();

  // El vino tal como lo dejó el escaneo malo: nombre y bodega iguales. Es la
  // forma exacta del bug Pispi, con un vino que no está en el catálogo curado.
  const existente = new Wine({
    userId: USER_ID,
    name: "Refugio Alto",
    winery: "Refugio Alto",
    varietal: "Bonarda",
    region: "Valle de Uco, Mendoza",
    type: "red",
    quantity: 1,
    identification: { verdict: "trusted", source: "scan" },
  });
  existente.save = async function save() { return this; };

  const db = stubEntorno(existente);
  try {
    const actualizado = await winesService.updateWine(USER_ID, "wine-1", {
      winery: "Bodega Los Cardones",
    });

    assert.equal(actualizado.winery, "Bodega Los Cardones");

    // 1. La fila equivocada deja de tener a esta persona detrás.
    assert.equal(spy.llamadas.retract.length, 1, "la identidad vieja tiene que retirarse");
    assert.equal(spy.llamadas.retract[0].wine.winery, "Refugio Alto");
    assert.equal(spy.llamadas.retract[0].wasTrusted, true);

    // 2. Y la corregida entra, como confiable: la escribió una persona con la
    //    botella en la mano.
    assert.equal(spy.llamadas.contribute.length, 1);
    assert.equal(spy.llamadas.contribute[0].wine.winery, "Bodega Los Cardones");
    assert.equal(spy.llamadas.contribute[0].verdict, "trusted");
    assert.equal(spy.llamadas.contribute[0].origin, "manual");
  } finally {
    spy.restore();
    db.restore();
  }
});

test("editar algo que no es la identidad no toca el catálogo", async () => {
  const spy = spyCatalogo();

  const existente = new Wine({
    userId: USER_ID,
    name: "Saint Felicien",
    winery: "Catena Zapata",
    varietal: "Malbec",
    quantity: 2,
  });
  existente.save = async function save() { return this; };

  const db = stubEntorno(existente);
  try {
    await winesService.updateWine(USER_ID, "wine-1", { notes: "Para el domingo", rating: 4 });

    assert.equal(spy.llamadas.contribute.length, 0);
    assert.equal(spy.llamadas.retract.length, 0);
  } finally {
    spy.restore();
    db.restore();
  }
});

test("una corrección que deja el vino igual de roto no lo publica", async () => {
  const spy = spyCatalogo();

  const existente = new Wine({
    userId: USER_ID,
    name: "Refugio Alto",
    winery: "Refugio Alto",
    varietal: "Bonarda",
    quantity: 1,
  });
  existente.save = async function save() { return this; };

  const db = stubEntorno(existente);
  try {
    // Cambia la bodega… por el mismo nombre otra vez. Movió el problema, no lo
    // arregló, y el catálogo público no tiene por qué enterarse.
    await winesService.updateWine(USER_ID, "wine-1", { winery: "REFUGIO ALTO" });

    assert.equal(spy.llamadas.contribute.length, 1);
    assert.equal(spy.llamadas.contribute[0].verdict, "unverified");
  } finally {
    spy.restore();
    db.restore();
  }
});
