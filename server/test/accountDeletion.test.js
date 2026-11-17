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
