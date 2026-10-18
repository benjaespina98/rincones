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
