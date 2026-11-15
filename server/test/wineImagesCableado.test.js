const test = require("node:test");
const assert = require("node:assert/strict");
const WineImage = require("../src/models/wineImage.model");
const wineImages = require("../src/services/wineImages.service");

/**
 * El pool de fotos es la cara pública de un vino: una URL que no pasa `esImagenAceptada`
 * (http plano, esquema ajeno, comillas que rompen un url() de CSS) no puede entrar. La función
 * pura está probada en imagenAceptada.test.js; esto fija que `contribute` LA USA.
 */
const MALAS = ["javascript:alert(1)", "http://x.com/a.jpg", 'https://x.com/a.jpg"); color: red; ("', "data:text/html;base64,PHNjcmlwdD4="];
const BUENA = "https://res.cloudinary.com/x/image/upload/ok.jpg";

const conEspia = async (fn) => {
  const original = { findOne: WineImage.findOne, updateOne: WineImage.updateOne };
  const escrituras = [];
  WineImage.findOne = () => {
    const q = Promise.resolve(null);
    q.select = () => q;
    q.lean = () => q;
    return q;
  };
  WineImage.updateOne = async (...args) => {
    escrituras.push(args);
    return {};
  };
  try {
    await fn(escrituras);
  } finally {
    WineImage.findOne = original.findOne;
    WineImage.updateOne = original.updateOne;
  }
};

for (const mala of MALAS) {
  test(`contribute descarta la imagen ${JSON.stringify(mala).slice(0, 40)}: no escribe en el pool`, async () => {
    await conEspia(async (escrituras) => {
      await wineImages.contribute({ name: "Malbec", winery: "Bodega X", varietal: "Malbec", image: mala });
      assert.equal(escrituras.length, 0);
    });
  });
}

test("contribute guarda una URL https aceptable", async () => {
  await conEspia(async (escrituras) => {
    await wineImages.contribute({ name: "Malbec", winery: "Bodega X", varietal: "Malbec", image: BUENA });
    assert.equal(escrituras.length, 1);
  });
});

test("conFotoConfiable: completa sólo los vinos sin foto y sólo con fotos del pool bien puntuadas", async () => {
  const original = WineImage.find;
  let filtro;
  WineImage.find = (f) => {
    filtro = f;
    const q = Promise.resolve([{ key: wineImages.wineKey("Catena", "Catena Zapata", "Malbec"), image: BUENA }]);
    q.select = () => q;
    q.lean = () => q;
    return q;
  };
  try {
    const propia = "https://res.cloudinary.com/x/image/upload/mia.jpg";
    const salida = await wineImages.conFotoConfiable([
      { name: "Catena", winery: "Catena Zapata", varietal: "Malbec" },
      { name: "Otro", winery: "Otra", varietal: "Syrah" },
      { name: "Catena", winery: "Catena Zapata", varietal: "Malbec", image: propia },
    ]);
    assert.equal(salida[0].image, BUENA);
    assert.equal(salida[1].image, undefined, "sin foto en el pool, queda sin foto");
    assert.equal(salida[2].image, propia, "la foto propia nunca se pisa");
    assert.deepEqual(filtro.qualityScore, { $gte: 70 }, "el pool se consulta con piso de calidad");
  } finally {
    WineImage.find = original;
  }
});
