const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false); // sin base: lo no stubeado falla en el acto en vez de esperar 10 s
const Wine = require("../src/models/wine.model");
const WineMoment = require("../src/models/wineMoment.model");
const WineWish = require("../src/models/wineWish.model");
const ChangeLog = require("../src/models/changeLog.model");
const User = require("../src/models/user.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const winePrices = require("../src/services/winePrices.service");
const imageStorage = require("../src/services/imageStorage.service");
const winesService = require("../src/services/wines.service");
const wishesService = require("../src/services/wishes.service");

/**
 * `esImagenAceptada` está bien probada como función pura (imagenAceptada.test.js), pero eso
 * no dice nada de si los servicios la USAN: si alguien revierte un `if`, la suite seguía en
 * verde. Estos tests fijan el CABLEADO en los caminos por donde entra una foto que escribe un
 * usuario: alta, edición y momentos de un vino, y los deseos.
 *
 * Nada de esto se restaura: ningún test de este archivo lee el resultado real de lo que se
 * stubea (ver la nota del mismo bloque en wines.service.test.js: sin esto cada llamada espera
 * el buffering de mongoose, ~10s).
 */
User.updateOne = async () => ({}); // contadores del perfil (update atómico)
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

const MALA = ["javascript:alert(1)", "http://x.com/a.jpg", "data:text/html;base64,PHNjcmlwdD4=", 'https://x.com/a.jpg"); color: red; ("'];
const BUENA = "https://res.cloudinary.com/x/image/upload/ok.jpg";

/** Reemplaza `imageStorage.store` por un espía y lo deja puesto sólo durante el test. */
const conEspiaDeStorage = async (fn) => {
  const original = imageStorage.store;
  const llamadas = [];
  imageStorage.store = async (valor) => {
    llamadas.push(valor);
    return `almacenada:${valor}`;
  };
  try {
    await fn(llamadas);
  } finally {
    imageStorage.store = original;
  }
};

// ───────────────────────── createWine ─────────────────────────

const crearVino = async (image) => {
  const originalSave = Wine.prototype.save;
  const originalFindById = User.findById;
  const user = { stats: { winesCount: 0, tastedWines: 0 }, save: async () => {} };
  User.findById = async () => user;
  Wine.prototype.save = async function save() {
    return this;
  };
  try {
    return await winesService.createWine(USER_ID, {
      name: "Malbec",
      winery: "Bodega X",
      varietal: "Malbec",
      quantity: 1,
      image,
    });
  } finally {
    Wine.prototype.save = originalSave;
    User.findById = originalFindById;
  }
};

for (const mala of MALA) {
  test(`createWine descarta la imagen ${JSON.stringify(mala).slice(0, 40)}: no se sube ni se guarda`, async () => {
    await conEspiaDeStorage(async (llamadas) => {
      const { wine } = await crearVino(mala);
      assert.equal(llamadas.length, 0, "una imagen no aceptada no tiene que llegar al storage");
      assert.ok(!wine.image, "y no puede quedar guardada en el vino");
    });
  });
}

test("createWine con una URL https la sube y la guarda", async () => {
  await conEspiaDeStorage(async (llamadas) => {
    const { wine } = await crearVino(BUENA);
    assert.deepEqual(llamadas, [BUENA]);
    assert.equal(wine.image, `almacenada:${BUENA}`);
  });
});

// ───────────────────────── updateWine ─────────────────────────

const editarVino = async (imageNueva) => {
  const originalFindOne = Wine.findOne;
  const originalFindById = User.findById;
  User.findById = async () => ({ stats: { winesCount: 1, tastedWines: 0 }, save: async () => {} });
  const vino = new Wine({ userId: USER_ID, name: "Cabernet", quantity: 1, image: "https://viejo.example/a.jpg" });
  vino.save = async function save() {
    return this;
  };
  Wine.findOne = async () => vino;
  try {
    const actualizado = await winesService.updateWine(USER_ID, "wine-1", { image: imageNueva });
    return actualizado;
  } finally {
    Wine.findOne = originalFindOne;
    User.findById = originalFindById;
  }
};

for (const mala of MALA) {
  test(`updateWine ignora la imagen ${JSON.stringify(mala).slice(0, 40)}: la foto vigente no se pisa`, async () => {
    await conEspiaDeStorage(async (llamadas) => {
      const actualizado = await editarVino(mala);
      assert.equal(llamadas.length, 0);
      assert.equal(actualizado.image, "https://viejo.example/a.jpg");
    });
  });
}

test("updateWine con una URL https la reemplaza", async () => {
  await conEspiaDeStorage(async (llamadas) => {
    const actualizado = await editarVino(BUENA);
    assert.deepEqual(llamadas, [BUENA]);
    assert.equal(actualizado.image, `almacenada:${BUENA}`);
  });
});

// ───────────────────────── addMoment ─────────────────────────

const agregarMomento = async (photos) => {
  const originalFindOne = Wine.findOne;
  const originalCreate = WineMoment.create;
  let creado = null;
  const vino = new Wine({ userId: USER_ID, name: "Malbec", quantity: 1, tasted: true });
  vino.save = async function save() {
    return this;
  };
  Wine.findOne = async () => vino;
  WineMoment.create = async (doc) => {
    creado = { ...doc, consumedAt: new Date() };
    return creado;
  };
  try {
    await winesService.addMoment(USER_ID, "wine-1", { notes: "cena", photos });
    return creado;
  } finally {
    Wine.findOne = originalFindOne;
    WineMoment.create = originalCreate;
  }
};

test("addMoment sólo sube las fotos aceptables y conserva el orden", async () => {
  await conEspiaDeStorage(async (llamadas) => {
    const creado = await agregarMomento([BUENA, "data:image/png;base64,AAAA"]);
    assert.deepEqual(llamadas, [BUENA, "data:image/png;base64,AAAA"]);
    assert.equal(creado.photos.length, 2);
  });
});

test("addMoment descarta las fotos inválidas sin subirlas", async () => {
  await conEspiaDeStorage(async (llamadas) => {
    const creado = await agregarMomento(MALA.slice(0, 2));
    assert.equal(llamadas.length, 0);
    assert.deepEqual(creado.photos, []);
  });
});

test("addMoment mezcla: las malas se saltean y las buenas entran (el tope de 2 se aplica antes)", async () => {
  await conEspiaDeStorage(async (llamadas) => {
    const creado = await agregarMomento(["javascript:alert(1)", BUENA, "https://x.example/tercera.jpg"]);
    assert.deepEqual(llamadas, [BUENA], "sólo se miran las dos primeras: la mala y la buena");
    assert.equal(creado.photos.length, 1);
  });
});

// ───────────────────────── createWish ─────────────────────────

const crearDeseo = async (image, { existente = null } = {}) => {
  const originalFindOne = WineWish.findOne;
  const originalCreate = WineWish.create;
  let creado = null;
  WineWish.findOne = async () => existente;
  WineWish.create = async (doc) => {
    creado = doc;
    return doc;
  };
  try {
    const resultado = await wishesService.createWish(USER_ID, { name: "Malbec", winery: "Bodega X", image });
    return { resultado, creado };
  } finally {
    WineWish.findOne = originalFindOne;
    WineWish.create = originalCreate;
  }
};

for (const mala of MALA) {
  test(`createWish descarta la imagen ${JSON.stringify(mala).slice(0, 40)}`, async () => {
    const { creado } = await crearDeseo(mala);
    assert.equal(creado.image, "");
  });
}

test("createWish conserva una URL https y le saca los espacios", async () => {
  const { creado } = await crearDeseo(`  ${BUENA}  `);
  assert.equal(creado.image, BUENA);
});

test("createWish sobre un deseo existente sin foto: completa con una buena, ignora una mala", async () => {
  const sinFoto = () => ({ image: "", favorite: false, save: async function save() { return this; } });

  const a = sinFoto();
  await crearDeseo(BUENA, { existente: a });
  assert.equal(a.image, BUENA);

  const b = sinFoto();
  await crearDeseo("javascript:alert(1)", { existente: b });
  assert.equal(b.image, "");
});

test("addMoment acota el texto libre y la lista de etiquetas", async () => {
  const originalFindOne = Wine.findOne;
  const originalCreate = WineMoment.create;
  let creado = null;
  const vino = new Wine({ userId: USER_ID, name: "Malbec", quantity: 1, tasted: true });
  vino.save = async function save() { return this; };
  Wine.findOne = async () => vino;
  WineMoment.create = async (doc) => { creado = { ...doc, consumedAt: new Date() }; return creado; };
  try {
    await winesService.addMoment(USER_ID, "wine-1", {
      notes: "n".repeat(50000),
      occasion: "o".repeat(5000),
      companions: "c".repeat(5000),
      tags: Array.from({ length: 50 }, () => "t".repeat(500)),
    });
  } finally {
    Wine.findOne = originalFindOne;
    WineMoment.create = originalCreate;
  }
  assert.equal(creado.notes.length, 4000);
  assert.equal(creado.occasion.length, 120);
  assert.equal(creado.companions.length, 200);
  assert.equal(creado.tags.length, 10);
  assert.ok(creado.tags.every((t) => t.length <= 40));
});
