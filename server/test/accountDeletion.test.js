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
    ["WineReview", WineReview], ["WinePrice", WinePrice],
    ["AnalyticsEvent", AnalyticsEvent], ["RefreshToken", RefreshToken],
    // Las charlas con la guia. Si manana se agrega otra coleccion al borrado y
    // no a esta lista, este test explota con un CastError — que es como se
    // descubrio que faltaba esta.
    ["SommelierConversation", SommelierConversation],
  ]) {
    stub(model, "deleteMany", async (f) => calls.push([label, f]));
  }
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
        "RefreshToken",
        // Las charlas con la guía: lo más personal que guarda la app, y con una
        // retención de 180 días que no alcanza acá — quien se da de baja pidió
        // que se vaya ahora, no dentro de medio año.
        "SommelierConversation",
        "User",
        "Wine",
        "WineMoment",
        "WinePrice",
        "WineReview",
        "WineWish",
      ]
    );
    assert.equal(calls.at(-1)[0], "User");
    assert.deepEqual(calls.find((c) => c[0] === "WinePrice")[1], { user: "u1" });
  } finally {
    restore();
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
