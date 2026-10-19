const test = require("node:test");
const assert = require("node:assert/strict");
const { conFotoPrimero, separarPorFoto } = require("../src/utils/destacados");
const catalogController = require("../src/controllers/catalog.controller");
const catalogService = require("../src/services/catalog.service");
const communityWines = require("../src/services/communityWines.service");
const recommendations = require("../src/services/recommendations.service");
const wineImages = require("../src/services/wineImages.service");
const Wine = require("../src/models/wine.model");
const User = require("../src/models/user.model");

/**
 * GET /api/catalog/featured recomienda CON FOTO primero y completa con los que no la tienen:
 * nunca devuelve una lista vacía mientras haya con qué (la tarjeta se ve con la botella genérica,
 * como siempre). El universo es el catálogo curado más lo que la gente cargó con su foto.
 */
const FOTO = (n) => `https://res.cloudinary.com/x/image/upload/${n}.jpg`;
const vino = (id, image) => ({ id, name: `Vino ${id}`, winery: `Bodega ${id}`, image });

test("conFotoPrimero: los que tienen foto van primero, cada grupo en su orden", () => {
  const r = conFotoPrimero([vino("a", ""), vino("b", FOTO("b")), vino("c", undefined), vino("d", FOTO("d"))], 8);
  assert.deepEqual(r.map((w) => w.id), ["b", "d", "a", "c"]);
});

test("conFotoPrimero: completa con los sin foto y respeta el máximo", () => {
  assert.deepEqual(conFotoPrimero([], 8), []);
  assert.deepEqual(conFotoPrimero([vino("a", "")], 8).map((w) => w.id), ["a"]);
  const muchos = Array.from({ length: 20 }, (_, i) => vino(`v${i}`, i % 2 ? FOTO(i) : ""));
  const r = conFotoPrimero(muchos, 8);
  assert.equal(r.length, 8);
  assert.ok(r.every((w) => w.image), "los 8 primeros son los que tienen foto");
});

test("separarPorFoto: una foto que no es válida (vacía, en blanco, http, javascript:, con comillas) no cuenta", () => {
  const malas = ["", "   ", "http://x.com/a.jpg", "javascript:alert(1)", 'https://x.com/a.jpg"); color: red; ("', null, 42];
  for (const image of malas) {
    const { con, sin } = separarPorFoto([vino("a", image)]);
    assert.equal(con.length, 0, JSON.stringify(image));
    assert.equal(sin.length, 1);
  }
});

test("separarPorFoto: tolera lo que no es una lista", () => {
  assert.deepEqual(separarPorFoto(null), { con: [], sin: [] });
  assert.deepEqual(separarPorFoto(undefined), { con: [], sin: [] });
});

// ── El endpoint, con el catálogo, la comunidad y las fotos reemplazados por fixtures ────────────

const cadena = (valor) => {
  const q = Promise.resolve(valor);
  q.select = () => q;
  q.lean = () => q;
  return q;
};

const pedirFeatured = async ({ curado = [], comunitarios = [], fotosDelPool = {} } = {}) => {
  const original = {
    pool: catalogService.getCatalogPool,
    comunidad: communityWines.conFoto,
    rank: recommendations.rankFeatured,
    enrich: wineImages.enrichWithImages,
    wineFind: Wine.find,
    userFind: User.findById,
  };
  catalogService.getCatalogPool = () => curado;
  communityWines.conFoto = async () => comunitarios;
  // El ranking de verdad no importa acá: se queda con los primeros `count`, en el orden recibido.
  recommendations.rankFeatured = (lista, _perfil, { count }) => lista.slice(0, count);
  wineImages.enrichWithImages = async (lista) =>
    lista.map((w) => (w.image || !fotosDelPool[w.id] ? w : { ...w, image: fotosDelPool[w.id] }));
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
    communityWines.conFoto = original.comunidad;
    recommendations.rankFeatured = original.rank;
    wineImages.enrichWithImages = original.enrich;
    Wine.find = original.wineFind;
    User.findById = original.userFind;
  }
};

test("featured: los vinos con foto van primero, en el orden del ranking", async () => {
  const { status, body } = await pedirFeatured({
    curado: [vino("a", ""), vino("b", FOTO("b")), vino("c", ""), vino("d", FOTO("d"))],
  });
  assert.equal(status, 200);
  assert.deepEqual(body.data.map((w) => w.id), ["b", "d", "a", "c"]);
});

test("featured: sin ninguno con foto recomienda igual (nunca una lista vacía)", async () => {
  const { status, body } = await pedirFeatured({ curado: [vino("a", ""), vino("b", "")] });
  assert.equal(status, 200);
  assert.deepEqual(body.data.map((w) => w.id), ["a", "b"]);
});

test("featured: usa las fotos que cargó la gente, del catálogo comunitario y del pool compartido", async () => {
  const { body } = await pedirFeatured({
    curado: [vino("a", ""), vino("p", "")],
    comunitarios: [vino("c1", FOTO("c1")), vino("c2", FOTO("c2"))],
    fotosDelPool: { p: FOTO("p") },
  });
  // Primero los 3 con foto (curado "p" con la foto del pool + los 2 comunitarios), después el resto.
  assert.deepEqual(body.data.map((w) => w.id).slice(0, 3).sort(), ["c1", "c2", "p"]);
  assert.equal(body.data.at(-1).id, "a");
});

test("featured: un vino que está en el catálogo curado y en la comunidad no se repite", async () => {
  const curado = [{ id: "x", name: "Saint Felicien", winery: "Catena", varietal: "Malbec", image: "" }];
  const comunitario = { id: "com-1", name: "Saint Felicien", winery: "Catena", varietal: "Malbec", image: FOTO("x") };
  const { body } = await pedirFeatured({ curado, comunitarios: [comunitario] });
  assert.equal(body.data.length, 1);
});

test("featured: nunca devuelve más de ocho", async () => {
  const muchos = Array.from({ length: 30 }, (_, i) => vino(`v${i}`, FOTO(i)));
  const { body } = await pedirFeatured({ curado: muchos });
  assert.equal(body.data.length, 8);
});
