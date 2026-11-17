const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const WineWish = require("../src/models/wineWish.model");
const WineMoment = require("../src/models/wineMoment.model");
const WineReview = require("../src/models/wineReview.model");
const WinePrice = require("../src/models/winePrice.model");
const AnalyticsEvent = require("../src/models/analyticsEvent.model");
const RefreshToken = require("../src/models/refreshToken.model");
const SommelierConversation = require("../src/models/sommelierConversation.model");
const WineImage = require("../src/models/wineImage.model");
const CommunityWine = require("../src/models/communityWine.model");
const ErrorLog = require("../src/models/errorLog.model");
const winePrices = require("../src/services/winePrices.service");
const imageStorage = require("../src/services/imageStorage.service");
const { deleteAccount } = require("../src/services/accountDeletion.service");

const stubModels = (role, admins) => {
  const calls = [];
  const originals = [];
  const stub = (model, name, fn) => {
    originals.push([model, name, model[name]]);
    model[name] = fn;
  };
  stub(User, "findById", () => ({ select: async () => (role ? { role } : null) }));
  stub(User, "countDocuments", async () => admins);
  stub(User, "deleteOne", async (f) => calls.push(["User", f]));
  for (const [label, model] of [
    ["Wine", Wine], ["WineWish", WineWish], ["WineMoment", WineMoment],
    ["WineReview", WineReview],
    ["AnalyticsEvent", AnalyticsEvent], ["RefreshToken", RefreshToken],
    // Las charlas con la guia. Si manana se agrega otra coleccion al borrado y
    // no a esta lista, este test explota con un CastError — que es como se
    // descubrio que faltaba esta.
    ["SommelierConversation", SommelierConversation],
    ["ErrorLog", ErrorLog],
  ]) {
    stub(model, "deleteMany", async (f) => calls.push([label, f]));
  }
  // El precio vive dentro de `samples[].user`: se retira con el servicio, no con un deleteMany.
  stub(winePrices, "retractAllFromUser", async (id) => calls.push(["WinePrice", id]));
  stub(WineImage, "updateMany", async (f) => calls.push(["WineImage", f]));
  stub(CommunityWine, "updateMany", async (f, u) => calls.push(["CommunityWine", f, u]));
  // Imágenes: sin fotos propias en este escenario (el borrado de imágenes tiene sus tests más abajo).
  const vacio = () => ({ select: () => ({ lean: async () => [] }) });
  stub(Wine, "find", vacio);
  stub(WineMoment, "find", vacio);
  stub(WineImage, "find", vacio);
  stub(CommunityWine, "find", vacio);
  stub(imageStorage, "eliminarImagenes", async () => 0);
  const restore = () => originals.forEach(([m, n, f]) => { m[n] = f; });
  return { calls, restore };
};

test("la baja borra los datos del usuario y la cuenta queda para lo último", async () => {
  const { calls, restore } = stubModels("user", 1);
  try {
    const result = await deleteAccount("u1");
    assert.equal(result.ok, true);
    assert.deepEqual(
      calls.map((c) => c[0]).sort(),
      [
        "AnalyticsEvent",
        "CommunityWine",
        "ErrorLog",
        // Dos veces a propósito: primero solo, para cerrar las sesiones, y otra vez dentro de la limpieza general.
        "RefreshToken",
        "RefreshToken",
        // Las charlas con la guía: lo más personal que guarda la app, y con una
        // retención de 180 días que no alcanza acá — quien se da de baja pidió
        // que se vaya ahora, no dentro de medio año.
        "SommelierConversation",
        "User",
        "Wine",
        "WineImage",
        "WineMoment",
        "WinePrice",
        "WineReview",
        "WineWish",
      ].sort()
    );
    // Las sesiones se cierran ANTES que todo lo demás: mientras se borra, nadie renueva el acceso.
    assert.equal(calls[0][0], "RefreshToken");
    assert.equal(calls.at(-1)[0], "User");
    assert.equal(calls.find((c) => c[0] === "WinePrice")[1], "u1");
    assert.deepEqual(calls.find((c) => c[0] === "WineImage")[1], { contributedBy: "u1" });
  } finally {
    restore();
  }
});

test("borrarDatosPropios pasa la sesión a cada borrado y, dentro de una transacción, los hace de a uno", async () => {
  const { borrarDatosPropios } = require("../src/services/accountDeletion.service");
  const llamadas = [];
  let enCurso = 0;
  let maxSimultaneas = 0;
  const originales = [];
  for (const [label, Modelo] of [["Wine", Wine], ["WineWish", WineWish], ["WineMoment", WineMoment], ["WineReview", WineReview]]) {
    originales.push([Modelo, Modelo.deleteMany]);
    Modelo.deleteMany = async (f, o) => {
      enCurso += 1;
      maxSimultaneas = Math.max(maxSimultaneas, enCurso);
      await new Promise((r) => setImmediate(r));
      enCurso -= 1;
      llamadas.push([label, f, o]);
    };
  }
  try {
    const sesion = { id: "S" };
    await borrarDatosPropios("u1", { session: sesion });
    assert.equal(llamadas.length, 4);
    assert.ok(llamadas.every((c) => c[2]?.session === sesion), "la sesión llega a cada borrado");
    assert.equal(maxSimultaneas, 1, "con sesión transaccional no hay operaciones en paralelo");
    llamadas.length = 0;
    await borrarDatosPropios("u1");
    assert.equal(llamadas.length, 4);
    assert.ok(llamadas.every((c) => c[2] === undefined));
  } finally {
    originales.forEach(([M, f]) => { M.deleteMany = f; });
  }
});

const NUBE = "https://res.cloudinary.com/demo/image/upload/";

test("publicIdDeUrl saca el id de una URL de Cloudinary propia y descarta las ajenas", () => {
  const anterior = process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
  try {
    assert.equal(imageStorage.publicIdDeUrl(`${NUBE}v123/rincones/wines/abc.jpg`), "rincones/wines/abc");
    assert.equal(imageStorage.publicIdDeUrl(`${NUBE}f_auto,q_auto,w_800,c_limit/v9/rincones/moments/x.webp`), "rincones/moments/x");
    assert.equal(imageStorage.publicIdDeUrl("https://res.cloudinary.com/otro/image/upload/v1/a/b.jpg"), "");
    assert.equal(imageStorage.publicIdDeUrl("https://lh3.googleusercontent.com/foto"), "");
    assert.equal(imageStorage.publicIdDeUrl(""), "");
  } finally {
    if (anterior === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = anterior;
  }
});

test("la baja borra de Cloudinary las fotos propias, pero NO las que usa el pool o la comunidad", async () => {
  const anterior = process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
  const { calls, restore } = stubModels("user", 1);
  const propia = `${NUBE}v1/rincones/wines/propia.jpg`;
  const delPool = `${NUBE}v1/rincones/wines/delpool.jpg`;
  const momento = `${NUBE}v1/rincones/moments/m.jpg`;
  const chain = (docs) => () => ({ select: () => ({ lean: async () => docs }) });
  const borradas = [];
  const prev = {
    wineFind: Wine.find, momentFind: WineMoment.find, poolFind: WineImage.find, comunidadFind: CommunityWine.find, elim: imageStorage.eliminarImagenes,
  };
  // Antes de borrar: la persona tiene tres fotos. Después: el pool todavía usa una de ellas.
  let yaBorrado = false;
  Wine.find = (filtro) => ({ select: () => ({ lean: async () => (yaBorrado ? [] : [{ image: propia }, { image: delPool }]) }) });
  WineMoment.find = (filtro) => ({ select: () => ({ lean: async () => (yaBorrado ? [] : [{ photos: [momento] }]) }) });
  WineImage.find = chain([{ image: delPool }]);
  CommunityWine.find = chain([]);
  const deleteOne = User.deleteOne;
  User.deleteOne = async (f) => { yaBorrado = true; calls.push(["User", f]); };
  imageStorage.eliminarImagenes = async (urls) => { borradas.push(...urls); return urls.length; };
  try {
    const r = await deleteAccount("u1");
    assert.equal(r.ok, true);
    assert.deepEqual(borradas.sort(), [momento, propia].sort(), "se borran las propias y se respeta la que usa el pool");
  } finally {
    User.deleteOne = deleteOne;
    Wine.find = prev.wineFind; WineMoment.find = prev.momentFind; WineImage.find = prev.poolFind; CommunityWine.find = prev.comunidadFind;
    imageStorage.eliminarImagenes = prev.elim;
    restore();
    if (anterior === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = anterior;
  }
});

test("un fallo al borrar las imágenes no deshace la baja", async () => {
  const { restore } = stubModels("user", 1);
  imageStorage.eliminarImagenes = async () => { throw new Error("Cloudinary caído"); };
  const prevFind = Wine.find;
  Wine.find = () => ({ select: () => ({ lean: async () => [{ image: "https://res.cloudinary.com/demo/image/upload/v1/x.jpg" }] }) });
  const prevEnv = process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
  const log = console.error;
  console.error = () => {};
  try {
    const r = await deleteAccount("u1");
    assert.equal(r.ok, true);
  } finally {
    console.error = log;
    Wine.find = prevFind;
    restore();
    if (prevEnv === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = prevEnv;
  }
});

test("el único admin no se puede dar de baja y no se borra nada", async () => {
  const { calls, restore } = stubModels("admin", 1);
  try {
    const result = await deleteAccount("a1");
    assert.deepEqual(result, { ok: false, reason: "last_admin" });
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("un usuario inexistente devuelve not_found sin borrar nada", async () => {
  const { calls, restore } = stubModels(null, 0);
  try {
    assert.deepEqual(await deleteAccount("x"), { ok: false, reason: "not_found" });
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
