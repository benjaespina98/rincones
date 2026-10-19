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

const pedirFeatured = async ({ curado = [], comunitarios = [], fotosDelPool = {}, fotosComunitarias = {} } = {}) => {
  const original = {
    pool: catalogService.getCatalogPool,
    comunidad: communityWines.conFoto,
    imagenes: communityWines.imagenesDe,
    rank: recommendations.rankFeatured,
    enrich: wineImages.enrichWithImages,
    wineFind: Wine.find,
    userFind: User.findById,
  };
  catalogService.getCatalogPool = () => curado;
  communityWines.conFoto = async () => comunitarios;
  communityWines.imagenesDe = async (ids) => new Map(ids.filter((id) => fotosComunitarias[id]).map((id) => [id, fotosComunitarias[id]]));
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
    communityWines.imagenesDe = original.imagenes;
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

test("featured: las fotos comunitarias se traen sólo para los elegidos y no viajan marcas internas", async () => {
  const diferido = (id) => ({ id, name: `Vino ${id}`, winery: `Bodega ${id}`, image: "", fotoDiferida: true });
  const { body } = await pedirFeatured({
    curado: [vino("a", "")],
    comunitarios: [diferido("com-1"), diferido("com-2")],
    fotosComunitarias: { "com-1": FOTO("1"), "com-2": FOTO("2") },
  });
  assert.deepEqual(body.data.slice(0, 2).map((w) => [w.id, w.image]), [["com-1", FOTO("1")], ["com-2", FOTO("2")]]);
  assert.ok(body.data.every((w) => !("fotoDiferida" in w)));
});

test("featured: si la foto diferida ya no está, el vino se recomienda igual, sin foto", async () => {
  const { body } = await pedirFeatured({
    comunitarios: [{ id: "com-9", name: "Vino 9", winery: "Bodega 9", image: "", fotoDiferida: true }],
  });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].image, "");
});

test("communityWines.conFoto: la consulta no trae la imagen y el resultado se cachea", async () => {
  const CommunityWine = require("../src/models/communityWine.model");
  const original = CommunityWine.find;
  let llamadas = 0;
  let proyeccion = "";
  CommunityWine.find = () => {
    llamadas += 1;
    const q = Promise.resolve([{ key: "k1", name: "Uno", winery: "B", count: 2, verified: true }]);
    q.select = (campos) => ((proyeccion = campos), q);
    q.sort = () => q;
    q.limit = () => q;
    q.lean = () => q;
    return q;
  };
  communityWines.olvidarCache();
  try {
    const a = await communityWines.conFoto(300);
    const b = await communityWines.conFoto(300);
    assert.equal(llamadas, 1);
    assert.match(proyeccion, /-image/);
    assert.equal(a[0].fotoDiferida, true);
    assert.equal(a[0].image, "");
    assert.equal(b.length, 1);
  } finally {
    CommunityWine.find = original;
    communityWines.olvidarCache();
  }
});

test("featured: con el ranking REAL, un vino comunitario con foto aparece primero", async () => {
  const original = recommendations.rankFeatured;
  recommendations.rankFeatured = require("../src/services/recommendations.service").rankFeatured;
  const real = require("../src/services/recommendations.service");
  recommendations.rankFeatured = original;
  assert.equal(typeof real.rankFeatured, "function");
  // Se llama al ranking real a mano con la forma exacta de un comunitario.
  const comunitario = { id: "com-k", name: "Uno", winery: "B", region: "Mendoza", varietal: "Malbec", type: "red", image: FOTO("k"), rating: 0, vintage: "", score: 3 };
  const perfil = real.buildTasteProfile({ wines: [], preferences: {} });
  const r = real.rankFeatured([comunitario], perfil, { count: 8, seed: 1 });
  assert.deepEqual(r.map((w) => w.id), ["com-k"]);
});

test("featured: si la comunidad falla, el catálogo curado se recomienda igual", async () => {
  const original = communityWines.conFoto;
  const { body, status } = await pedirFeatured({ curado: [vino("a", ""), vino("b", FOTO("b"))], comunitarios: [] });
  assert.equal(status, 200);
  assert.deepEqual(body.data.map((w) => w.id), ["b", "a"]);
  assert.equal(communityWines.conFoto, original);
});

test("featured: pide el ranking de los sin foto sólo por lo que falta", async () => {
  const original = recommendations.rankFeatured;
  const pedidos = [];
  const res = { set() {}, status() { return this; }, json() { return this; } };
  const prev = {
    pool: catalogService.getCatalogPool, com: communityWines.conFoto, enrich: wineImages.enrichWithImages,
    wineFind: Wine.find, userFind: User.findById,
  };
  catalogService.getCatalogPool = () => [...Array.from({ length: 3 }, (_, i) => vino(`f${i}`, FOTO(i))), vino("s1", ""), vino("s2", "")];
  communityWines.conFoto = async () => [];
  wineImages.enrichWithImages = async (l) => l;
  Wine.find = () => cadena([]);
  User.findById = () => cadena(null);
  recommendations.rankFeatured = (lista, _p, { count }) => (pedidos.push({ n: lista.length, count }), lista.slice(0, count));
  try {
    await catalogController.featured({ user: { id: "u1" } }, res, (e) => { throw e; });
  } finally {
    recommendations.rankFeatured = original;
    catalogService.getCatalogPool = prev.pool; communityWines.conFoto = prev.com; wineImages.enrichWithImages = prev.enrich;
    Wine.find = prev.wineFind; User.findById = prev.userFind;
  }
  assert.deepEqual(pedidos, [{ n: 3, count: 8 }, { n: 2, count: 5 }]);
});
