const test = require("node:test");
const assert = require("node:assert/strict");
const { soloConFoto } = require("../src/utils/destacados");
const catalogController = require("../src/controllers/catalog.controller");
const catalogService = require("../src/services/catalog.service");
const recommendations = require("../src/services/recommendations.service");
const wineImages = require("../src/services/wineImages.service");
const Wine = require("../src/models/wine.model");
const User = require("../src/models/user.model");

/**
 * GET /api/catalog/featured devuelve SÓLO vinos con foto válida. Sin foto no es una recomendación
 * (la tarjeta de Descubrí mostraría la botella genérica). Puede devolver menos de ocho, o ninguno.
 */
const FOTO = (n) => `https://res.cloudinary.com/x/image/upload/${n}.jpg`;
const vino = (id, image) => ({ id, name: `Vino ${id}`, image });

test("soloConFoto: conserva el orden y descarta lo que no tiene foto", () => {
  const r = soloConFoto([vino("a", ""), vino("b", FOTO("b")), vino("c", undefined), vino("d", FOTO("d"))], 8);
  assert.deepEqual(r.map((w) => w.id), ["b", "d"]);
});

test("soloConFoto: ninguno, uno y muchos", () => {
  assert.deepEqual(soloConFoto([], 8), []);
  assert.deepEqual(soloConFoto([vino("a", "")], 8), []);
  assert.equal(soloConFoto([vino("a", FOTO("a"))], 8).length, 1);
  const muchos = Array.from({ length: 20 }, (_, i) => vino(`v${i}`, FOTO(i)));
  assert.equal(soloConFoto(muchos, 8).length, 8);
});

test("soloConFoto: una foto que no es válida (vacía, en blanco, http, javascript:, con comillas) no cuenta", () => {
  const malas = ["", "   ", "http://x.com/a.jpg", "javascript:alert(1)", 'https://x.com/a.jpg"); color: red; ("', null, 42];
  for (const image of malas) {
    assert.deepEqual(soloConFoto([vino("a", image)], 8), [], JSON.stringify(image));
  }
});

test("soloConFoto: tolera lo que no es una lista", () => {
  assert.deepEqual(soloConFoto(null, 8), []);
  assert.deepEqual(soloConFoto(undefined, 8), []);
});

// ── El endpoint, con el catálogo y las fotos reemplazados por fixtures ──────────────────────────

const cadena = (valor) => {
  const q = Promise.resolve(valor);
  q.select = () => q;
  q.lean = () => q;
  return q;
};

const pedirFeatured = async (candidatos) => {
  const original = {
    pool: catalogService.getCatalogPool,
    rank: recommendations.rankFeatured,
    enrich: wineImages.enrichWithImages,
    wineFind: Wine.find,
    userFind: User.findById,
  };
  catalogService.getCatalogPool = () => [];
  recommendations.rankFeatured = () => candidatos;
  wineImages.enrichWithImages = async (lista) => lista;
  Wine.find = () => cadena([]);
  User.findById = () => cadena(null);
  try {
    let status = null;
    let body = null;
    const res = {
      set() {},
      status(s) {
        status = s;
        return this;
      },
      json(b) {
        body = b;
        return this;
      },
    };
    await catalogController.featured({ user: { id: "u1" } }, res, (e) => {
      throw e;
    });
    return { status, body };
  } finally {
    catalogService.getCatalogPool = original.pool;
    recommendations.rankFeatured = original.rank;
    wineImages.enrichWithImages = original.enrich;
    Wine.find = original.wineFind;
    User.findById = original.userFind;
  }
};

test("featured: devuelve sólo los que tienen foto, en el orden del ranking", async () => {
  const { status, body } = await pedirFeatured([vino("a", ""), vino("b", FOTO("b")), vino("c", ""), vino("d", FOTO("d"))]);
  assert.equal(status, 200);
  assert.deepEqual(body.data.map((w) => w.id), ["b", "d"]);
});

test("featured: sin ninguno con foto devuelve una lista vacía (no completa con vinos sin foto)", async () => {
  const { status, body } = await pedirFeatured([vino("a", ""), vino("b", "")]);
  assert.equal(status, 200);
  assert.deepEqual(body.data, []);
});

test("featured: nunca devuelve más de ocho", async () => {
  const muchos = Array.from({ length: 30 }, (_, i) => vino(`v${i}`, FOTO(i)));
  const { body } = await pedirFeatured(muchos);
  assert.equal(body.data.length, 8);
});
