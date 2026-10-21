const test = require("node:test");
const assert = require("node:assert/strict");
const { conFotoPrimero, separarPorFoto } = require("../src/utils/destacados");
const catalogController = require("../src/controllers/catalog.controller");
const catalogService = require("../src/services/catalog.service");
const communityWines = require("../src/services/communityWines.service");
const recommendations = require("../src/services/recommendations.service");
const wineImages = require("../src/services/wineImages.service");
const WineImage = require("../src/models/wineImage.model");
const CommunityWine = require("../src/models/communityWine.model");
const Wine = require("../src/models/wine.model");
const User = require("../src/models/user.model");
const WineWish = require("../src/models/wineWish.model");

/**
 * GET /api/catalog/featured recomienda de TODO lo cargado (catálogo curado + lo que cargó la gente,
 * con o sin foto), según el gusto de quien pregunta. La foto y la buena identificación SUMAN
 * puntos, no filtran; lo que ya tenés no se recomienda; las fotos salen de la base de todos.
 */
const FOTO = (n) => `https://res.cloudinary.com/x/image/upload/${n}.jpg`;
const vino = (id, extra = {}) => ({
  id,
  name: `Vino ${id}`,
  winery: `Bodega ${id}`,
  varietal: "Malbec",
  region: "Mendoza",
  type: "red",
  image: "",
  source: "catalogo-ar",
  ...extra,
});
const comunitario = (id, extra = {}) => vino(id, { id: `com-${id}`, source: "comunidad", fotoDiferida: false, confiable: false, ...extra });

// ── utilidades ────────────────────────────────────────────────────────────────────────────────

test("conFotoPrimero: los que tienen foto van primero, cada grupo en su orden", () => {
  const r = conFotoPrimero([vino("a"), vino("b", { image: FOTO("b") }), vino("c"), vino("d", { image: FOTO("d") })], 8);
  assert.deepEqual(r.map((w) => w.id), ["b", "d", "a", "c"]);
});

test("separarPorFoto: una foto que no es válida no cuenta; la diferida sí", () => {
  for (const image of ["", "   ", "http://x.com/a.jpg", "javascript:alert(1)", null, 42]) {
    assert.equal(separarPorFoto([vino("a", { image })]).con.length, 0, JSON.stringify(image));
  }
  assert.equal(separarPorFoto([vino("a", { fotoDiferida: true })]).con.length, 1);
  assert.deepEqual(separarPorFoto(null), { con: [], sin: [] });
});

// ── el endpoint, con el catálogo, la comunidad y las fotos reemplazados por fixtures ──────────

const cadena = (valor) => {
  const q = Promise.resolve(valor);
  q.select = () => q;
  q.lean = () => q;
  return q;
};

const pedirFeatured = async ({
  curado = [],
  comunitarios = [],
  clavesConFoto = new Set(),
  propios = [],
  guardados = [],
  preferencias = {},
  fotosComunidad = {},
  fotosPool = {},
  usuario = "u1",
  ahora = Date.UTC(2026, 9, 20, 15),
} = {}) => {
  const original = {
    pool: catalogService.getCatalogPool,
    para: communityWines.paraRecomendar,
    imagenes: communityWines.imagenesDe,
    claves: wineImages.keysConFoto,
    delPool: wineImages.getImagesFor,
    wineFind: Wine.find,
    userFind: User.findById,
    wishFind: WineWish.find,
    now: Date.now,
  };
  catalogService.getCatalogPool = () => curado;
  communityWines.paraRecomendar = async () => comunitarios;
  communityWines.imagenesDe = async (ids) => new Map(ids.filter((id) => fotosComunidad[id]).map((id) => [id, fotosComunidad[id]]));
  wineImages.keysConFoto = async () => clavesConFoto;
  wineImages.getImagesFor = async (lista) => {
    const m = new Map();
    for (const w of lista) {
      const f = fotosPool[w.id];
      if (f) m.set(wineImages.wineKey(w.name, w.winery, w.varietal), f);
    }
    return m;
  };
  Wine.find = () => cadena(propios);
  User.findById = () => cadena({ preferences: preferencias });
  WineWish.find = () => cadena(guardados);
  Date.now = () => ahora;
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
    await catalogController.featured({ user: { id: usuario } }, res, (e) => {
      throw e;
    });
    return { status, body };
  } finally {
    catalogService.getCatalogPool = original.pool;
    communityWines.paraRecomendar = original.para;
    communityWines.imagenesDe = original.imagenes;
    wineImages.keysConFoto = original.claves;
    wineImages.getImagesFor = original.delPool;
    Wine.find = original.wineFind;
    User.findById = original.userFind;
    WineWish.find = original.wishFind;
    Date.now = original.now;
  }
};

const claveDe = (w) => wineImages.wineKey(w.name, w.winery, w.varietal);

test("featured: recomienda también lo que cargó la gente, con o sin foto", async () => {
  const { status, body } = await pedirFeatured({
    curado: [vino("c1"), vino("c2")],
    comunitarios: [comunitario("u1", { fotoDiferida: true }), comunitario("u2"), comunitario("u3")],
  });
  assert.equal(status, 200);
  const ids = body.data.map((w) => w.id);
  for (const id of ["com-u1", "com-u2", "com-u3"]) assert.ok(ids.includes(id), `falta ${id}`);
});

test("featured: la foto SUMA pero no filtra: sin ninguna foto recomienda igual, y con fotos salen primero", async () => {
  const sin = await pedirFeatured({ curado: [vino("a"), vino("b")] });
  assert.equal(sin.body.data.length, 2);

  const mezcla = Array.from({ length: 6 }, (_, i) => vino(`m${i}`));
  const conFoto = new Set([claveDe(mezcla[3]), claveDe(mezcla[5])]);
  const { body } = await pedirFeatured({ curado: mezcla, clavesConFoto: conFoto, fotosPool: { m3: FOTO("m3"), m5: FOTO("m5") } });
  assert.equal(body.data.length, 6, "los sin foto también están");
  assert.deepEqual(body.data.slice(0, 2).map((w) => w.id).sort(), ["m3", "m5"]);
  assert.ok(body.data.slice(0, 2).every((w) => w.image));
});

test("featured: las fotos salen de la base de todos (comunidad y pool compartido), sólo de los elegidos", async () => {
  const delPool = vino("p");
  const { body } = await pedirFeatured({
    curado: [delPool],
    comunitarios: [comunitario("k", { fotoDiferida: true })],
    clavesConFoto: new Set([claveDe(delPool)]),
    fotosComunidad: { "com-k": FOTO("k") },
    fotosPool: { p: FOTO("p") },
  });
  const porId = Object.fromEntries(body.data.map((w) => [w.id, w]));
  assert.equal(porId["com-k"].image, FOTO("k"));
  assert.equal(porId.p.image, FOTO("p"));
  assert.ok(body.data.every((w) => !("fotoDiferida" in w) && !("confiable" in w)), "sin marcas internas");
});

test("featured: una foto inválida no viaja", async () => {
  const w = vino("x", { image: "javascript:alert(1)" });
  const { body } = await pedirFeatured({ curado: [w] });
  assert.equal(body.data[0].image, "");
});

test("featured: lo que ya tenés no se recomienda, aunque esté escrito distinto", async () => {
  const propios = [{ name: "Reserva", winery: "Norton", varietal: "Malbec" }];
  const { body } = await pedirFeatured({
    curado: [vino("n", { name: "Norton Reserva", winery: "Norton" }), vino("otro")],
    comunitarios: [comunitario("n2", { name: "Norton Reserva", winery: "Norton" })],
    propios,
  });
  assert.deepEqual(body.data.map((w) => w.id), ["otro"]);
});

test("featured: un vino que está en el catálogo curado y en la comunidad no se repite", async () => {
  const { body } = await pedirFeatured({
    curado: [vino("x", { name: "Saint Felicien", winery: "Catena" })],
    comunitarios: [comunitario("y", { name: "Saint Felicien", winery: "Catena", fotoDiferida: true })],
  });
  assert.equal(body.data.length, 1);
});

test("featured: sigue el gusto: a quien toma Malbec le llegan sobre todo Malbec, y primero uno de su uva", async () => {
  const universo = [
    ...Array.from({ length: 6 }, (_, i) => vino(`mal${i}`, { varietal: "Malbec", region: "Mendoza", type: "red" })),
    ...Array.from({ length: 6 }, (_, i) => vino(`cha${i}`, { varietal: "Chardonnay", region: "Patagonia", type: "white" })),
  ];
  const propios = Array.from({ length: 4 }, (_, i) => ({ name: `Mi malbec ${i}`, winery: `Otra ${i}`, varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 }));
  const { body } = await pedirFeatured({ curado: universo, propios, preferencias: { favoriteVarietals: ["malbec"] } });
  // La primera tarjeta es de afinidad (su uva) y la segunda suele ser un descubrimiento: intercalar es
  // la regla. Pero el set se inclina por lo que toma.
  assert.equal(body.data[0].varietal, "Malbec");
  const malbec = body.data.filter((w) => w.varietal === "Malbec").length;
  assert.ok(malbec >= 3 && malbec >= body.data.length - malbec, `${malbec} de ${body.data.length} son Malbec`);
});

test("featured: nunca más de doce, sin repetir bodega", async () => {
  const muchos = Array.from({ length: 80 }, (_, i) => vino(`v${i}`, { winery: `B${i % 30}` }));
  const { body } = await pedirFeatured({ curado: muchos });
  assert.ok(body.data.length <= 12);
  const bodegas = body.data.map((w) => w.winery);
  assert.equal(new Set(bodegas).size, bodegas.length);
});

test("featured: no son siempre los mismos: cambia de un día al otro y entre personas, pero es estable dentro del día", async () => {
  const universo = Array.from({ length: 120 }, (_, i) => vino(`g${i}`, { winery: `Bodega ${i}` }));
  const ids = async (opts) => (await pedirFeatured({ curado: universo, ...opts })).body.data.map((w) => w.id).join(",");
  const hoy = Date.UTC(2026, 9, 20, 10);
  const mismoDia = Date.UTC(2026, 9, 20, 22);
  const manana = Date.UTC(2026, 9, 21, 10);
  assert.equal(await ids({ ahora: hoy }), await ids({ ahora: mismoDia }), "estable dentro del día");
  assert.notEqual(await ids({ ahora: hoy }), await ids({ ahora: manana }), "cambia al día siguiente");
  assert.notEqual(await ids({ ahora: hoy, usuario: "u1" }), await ids({ ahora: hoy, usuario: "u2" }), "distinto entre personas");
});

test("featured: si la comunidad no devuelve nada, el catálogo curado se recomienda igual", async () => {
  const { status, body } = await pedirFeatured({ curado: [vino("a"), vino("b")], comunitarios: [] });
  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
});

test("featured: lo bien identificado sale antes que lo dudoso del mismo gusto", async () => {
  const { body } = await pedirFeatured({
    comunitarios: [
      comunitario("dudoso", { winery: "Bodega Z" }),
      comunitario("verificado", { winery: "Bodega Y", source: "comunidad-verificada", confiable: true }),
    ],
  });
  assert.equal(body.data[0].id, "com-verificado");
});

// ── servicios ──────────────────────────────────────────────────────────────────────────────────

test("rankFeatured: `extra` empuja sin filtrar y `jitter` rota a los empatados según la semilla", () => {
  const perfil = recommendations.buildTasteProfile({ wines: [], preferences: {} });
  const pool = Array.from({ length: 40 }, (_, i) => vino(`r${i}`, { winery: `B${i}` }));
  const con = recommendations.rankFeatured(pool, perfil, { count: 5, seed: 1, extra: (w) => (w.id === "r7" ? 5 : 0) });
  assert.equal(con[0].id, "r7", "el extra lo sube");
  assert.equal(con.length, 5, "los demás siguen estando");
  const a = recommendations.rankFeatured(pool, perfil, { count: 5, seed: 1, jitter: 3 }).map((w) => w.id).join();
  const b = recommendations.rankFeatured(pool, perfil, { count: 5, seed: 2, jitter: 3 }).map((w) => w.id).join();
  assert.notEqual(a, b);
  assert.equal(a, recommendations.rankFeatured(pool, perfil, { count: 5, seed: 1, jitter: 3 }).map((w) => w.id).join(), "misma semilla, mismo resultado");
});

test("communityWines.paraRecomendar: todo lo publicado (sin exigir verificación), sin imagen y con el indicador de foto; se cachea", async () => {
  const original = CommunityWine.aggregate;
  let pipeline = null;
  let llamadas = 0;
  CommunityWine.aggregate = async (p) => {
    llamadas += 1;
    pipeline = p;
    return [
      { key: "k1", name: "Uno", winery: "B1", count: 3, verified: true, trustedCount: 2, tieneFoto: true },
      { key: "k2", name: "Dos", winery: "B2", count: 1, verified: false, trustedCount: 0, tieneFoto: false },
    ];
  };
  communityWines.olvidarCache();
  try {
    const lista = await communityWines.paraRecomendar(800);
    await communityWines.paraRecomendar(800);
    assert.equal(llamadas, 1, "cacheado");
    assert.deepEqual(pipeline[0], { $match: { published: true } }, "no exige verified ni foto");
    const proyeccion = pipeline.find((e) => e.$project).$project;
    assert.ok(!("image" in proyeccion), "no trae la imagen");
    assert.ok(proyeccion.tieneFoto.$in, "sabe si tiene foto (por los primeros caracteres)");
    assert.deepEqual(
      lista.map((w) => [w.id, w.fotoDiferida, w.confiable, w.source]),
      [
        ["com-k1", true, true, "comunidad-verificada"],
        ["com-k2", false, false, "comunidad"],
      ]
    );
    assert.ok(lista.every((w) => w.image === ""));
  } finally {
    CommunityWine.aggregate = original;
    communityWines.olvidarCache();
  }
});

test("wineImages.keysConFoto: sólo pide las claves (no las fotos) y tolera que falle", async () => {
  const original = WineImage.find;
  let proyeccion = "";
  WineImage.find = () => {
    const q = Promise.resolve([{ key: "a" }, { key: "b" }]);
    q.select = (c) => ((proyeccion = c), q);
    q.lean = () => q;
    return q;
  };
  try {
    const set = await wineImages.keysConFoto([vino("x"), vino("y")]);
    assert.equal(proyeccion, "key");
    assert.deepEqual([...set].sort(), ["a", "b"]);
    assert.equal((await wineImages.keysConFoto([])).size, 0);
    WineImage.find = () => {
      throw new Error("db caída");
    };
    assert.equal((await wineImages.keysConFoto([vino("x")])).size, 0);
  } finally {
    WineImage.find = original;
  }
});

test("communityWines.paraRecomendar: si la consulta falla devuelve [] y NO lo cachea (se reintenta); varias a la vez comparten un solo pedido", async () => {
  const original = CommunityWine.aggregate;
  const avisos = [];
  const warn = console.warn;
  console.warn = (...a) => avisos.push(a.join(" "));
  let llamadas = 0;
  CommunityWine.aggregate = async () => {
    llamadas += 1;
    throw new Error("cluster viejo");
  };
  communityWines.olvidarCache();
  try {
    assert.deepEqual(await communityWines.paraRecomendar(800), []);
    assert.ok(avisos.some((a) => a.includes("cluster viejo")), "queda avisado en el log");
    await communityWines.paraRecomendar(800);
    assert.equal(llamadas, 2, "no se cachea el fallo");

    CommunityWine.aggregate = async () => {
      llamadas += 1;
      await new Promise((r) => setTimeout(r, 20));
      return [{ key: "z", name: "Z", winery: "B", count: 1, verified: false, trustedCount: 0, tieneFoto: false }];
    };
    llamadas = 0;
    communityWines.olvidarCache();
    const [a, b, c] = await Promise.all([communityWines.paraRecomendar(800), communityWines.paraRecomendar(800), communityWines.paraRecomendar(800)]);
    assert.equal(llamadas, 1, "un solo pedido a la base");
    assert.equal(a.length + b.length + c.length, 3);
  } finally {
    console.warn = warn;
    CommunityWine.aggregate = original;
    communityWines.olvidarCache();
  }
});

test("featured: la rotación diaria nunca pone un vino sin afinidad delante de uno de su uva favorita", async () => {
  const universo = [
    vino("favorito", { varietal: "Malbec", region: "Mendoza", type: "red", winery: "B-fav" }),
    ...Array.from({ length: 60 }, (_, i) => vino(`ajeno${i}`, { varietal: "Riesling", region: "Neuquén", type: "white", winery: `BA${i}`, source: "comunidad-verificada", confiable: true, fotoDiferida: true })),
  ];
  const propios = Array.from({ length: 4 }, (_, i) => ({ name: `Mi malbec ${i}`, winery: `Otra ${i}`, varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 }));
  for (let dia = 0; dia < 12; dia += 1) {
    const { body } = await pedirFeatured({ curado: universo, propios, ahora: Date.UTC(2026, 9, 1 + dia, 12), preferencias: { favoriteVarietals: ["malbec"] } });
    assert.equal(body.data[0].id, "favorito", `día ${dia + 1}`);
  }
});

test("featured: un nombre sin clave de identidad (muy corto) no descarta a los demás", async () => {
  const { body } = await pedirFeatured({
    curado: [vino("a"), vino("b")],
    comunitarios: [comunitario("corto1", { name: "X", winery: "" }), comunitario("corto2", { name: "Y", winery: "" })],
    propios: [{ name: "Z", winery: "", varietal: "" }],
  });
  assert.ok(body.data.length >= 4, `devolvió ${body.data.length}`);
});

test("rankFeatured: con un pool de una sola uva el cupo se afloja y el set se completa igual", () => {
  const perfil = recommendations.buildTasteProfile({ wines: [], preferences: {} });
  const pool = Array.from({ length: 30 }, (_, i) => vino(`u${i}`, { winery: `B${i}` }));
  assert.equal(recommendations.rankFeatured(pool, perfil, { count: 12, seed: 3 }).length, 12);
});

// ── precisión del gusto: porcentaje, razones, lo que no le gustó y lo que ya guardó ────────────

const perfilDe = (wines, preferences = {}) => recommendations.buildTasteProfile({ wines, preferences });
const bodegaMalbec = Array.from({ length: 6 }, (_, i) => ({
  name: `M${i}`, winery: `W${i}`, varietal: "Malbec", region: "Mendoza", type: "red", rating: i < 3 ? 5 : 0,
  // dos ya tomados y uno en stock: la tarjeta tiene que decir eso y no "seis en tu bodega"
  tasted: i < 2, quantity: i === 5 ? 1 : 0,
}));

test("explicarRecomendacion: el porcentaje y las razones salen de la bodega de la persona", () => {
  const perfil = perfilDe(bodegaMalbec);
  const igual = recommendations.explicarRecomendacion(vino("a", { varietal: "Malbec", region: "Mendoza", type: "red" }), perfil);
  assert.equal(igual.modo, "afinidad");
  assert.ok(igual.coincidencia >= 90, `coincide en todo lo que sabemos: ${igual.coincidencia}%`);
  assert.ok(igual.razones.some((r) => /Como tomaste Malbec, te recomiendo este vino/.test(r)));
  assert.ok(igual.razones.some((r) => /Como te gusta el Malbec, te recomiendo este vino/.test(r)));
  assert.ok(igual.razones.some((r) => /Como tomaste varios vinos de Mendoza/.test(r)));
  assert.ok(igual.razones.length <= 3);

  const parecido = recommendations.explicarRecomendacion(vino("b", { varietal: "Malbec", region: "Salta", type: "red" }), perfil);
  assert.ok(parecido.coincidencia < igual.coincidencia, "otra región coincide menos");
});

test("explicarRecomendacion: con poco historial no inventa un porcentaje", () => {
  const poco = perfilDe(bodegaMalbec.slice(0, 2));
  assert.equal(recommendations.explicarRecomendacion(vino("a"), poco).coincidencia, null);
  const conGustos = perfilDe([], { favoriteVarietals: ["Malbec"] });
  assert.ok(recommendations.explicarRecomendacion(vino("a"), conGustos).coincidencia > 0, "los gustos elegidos alcanzan de base");
});

test("explicarRecomendacion: un descubrimiento se dice como tal y sin porcentaje", () => {
  const perfil = perfilDe(bodegaMalbec);
  const nuevo = recommendations.explicarRecomendacion(vino("n", { varietal: "Tannat", region: "Uruguay", type: "red" }), perfil);
  assert.equal(nuevo.modo, "descubrimiento");
  assert.equal(nuevo.coincidencia, null);
  assert.match(nuevo.razones[0], /Para que pruebes una uva nueva/);
});

test("lo que puntuó siempre bajo resta: esa uva baja y deja de competir", () => {
  const bodega = [
    ...bodegaMalbec,
    { name: "T1", winery: "Z1", varietal: "Tannat", region: "Salta", type: "red", rating: 1 },
    { name: "T2", winery: "Z2", varietal: "Tannat", region: "Salta", type: "red", rating: 2 },
  ];
  const perfil = perfilDe(bodega);
  assert.ok(perfil.evitados.has("tannat"));
  assert.ok(!perfil.evitados.has("malbec"));
  const pool = [vino("tan", { varietal: "Tannat", region: "Salta", type: "red", winery: "BT" }), vino("mal", { varietal: "Malbec", region: "Mendoza", type: "red", winery: "BM" })];
  const r = recommendations.rankFeatured(pool, perfil, { count: 2, seed: 1 });
  assert.equal(r[0].id, "mal");
  // Y no entra al set aunque sobre lugar: una uva que no le gustó no se recomienda.
  assert.ok(!r.some((w) => w.id === "tan"));
  assert.deepEqual(recommendations.explicarRecomendacion(pool[0], perfil).razones, []);
  // Si puntuó alto alguna vez esa uva, ya no se evita.
  const mixto = perfilDe([...bodega, { name: "T3", winery: "Z3", varietal: "Tannat", rating: 5 }]);
  assert.ok(!mixto.evitados.has("tannat"));
});

test("las razones cuentan lo que es verdad: lo tomado y lo que hay en stock", () => {
  const sinTomar = perfilDe([{ name: "a", winery: "x", varietal: "Syrah", region: "Salta", type: "red", tasted: false, quantity: 2 }]);
  const r = recommendations.explicarRecomendacion(vino("s", { varietal: "Syrah", region: "Salta", type: "red" }), sinTomar);
  assert.ok(!r.razones.some((t) => /Como tomaste Syrah/.test(t)));
  const tomado = perfilDe([{ name: "a", winery: "x", varietal: "Syrah", region: "Salta", type: "red", tasted: true, quantity: 0 }]);
  const t = recommendations.explicarRecomendacion(vino("s", { varietal: "Syrah", region: "Salta", type: "red" }), tomado);
  assert.ok(t.razones.some((x) => /Como tomaste Syrah/.test(x)));
  assert.ok(!t.razones.some((x) => /que tenés/.test(x)));
});

test("la coincidencia nunca llega a 100 ni baja de 0", () => {
  const perfil = perfilDe(bodegaMalbec);
  const igual = recommendations.explicarRecomendacion(vino("i"), perfil);
  assert.ok(igual.coincidencia <= 99);
  const lejos = recommendations.explicarRecomendacion(vino("l", { varietal: "Riesling", region: "Alsacia", type: "white" }), perfil);
  assert.ok(lejos.coincidencia === null || lejos.coincidencia >= 0);
});

test("el peso de lo que tomás depende de cuánto lo tomás", () => {
  const poco = perfilDe([
    { name: "a", winery: "x", varietal: "Tannat", type: "red" },
    ...Array.from({ length: 19 }, (_, i) => ({ name: `m${i}`, winery: `w${i}`, varietal: "Malbec", type: "red" })),
  ]);
  const tannat = vino("t", { varietal: "Tannat" });
  const malbec = vino("m", { varietal: "Malbec" });
  const explicar = (w) => recommendations.explicarRecomendacion(w, poco).coincidencia;
  assert.ok(explicar(malbec) > explicar(tannat), "la uva que es casi toda la bodega pesa más que la de una sola botella");
});

test("featured: lo que ya guardó para probar no se recomienda, y cada recomendación trae su motivo", async () => {
  const { body } = await pedirFeatured({
    curado: [vino("guardado", { name: "Vino guardado", winery: "Bodega guardada" }), vino("otro")],
    propios: bodegaMalbec,
    guardados: [{ name: "Vino guardado", winery: "Bodega guardada", varietal: "Malbec" }],
  });
  assert.deepEqual(body.data.map((w) => w.id), ["otro"]);
  assert.ok(body.data[0].motivo && ["afinidad", "descubrimiento"].includes(body.data[0].motivo.modo));
  assert.ok(Array.isArray(body.data[0].motivo.razones));
});
