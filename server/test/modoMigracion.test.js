const test = require("node:test");
const assert = require("node:assert/strict");
const { modoMigracion } = require("../scripts/lib/modoMigracion");

test("sin banderas es simulacro: no escribe", () => {
  assert.deepEqual(modoMigracion([], { MONGODB_DB_NAME: "test" }), { dry: true, aplicar: false, base: "test" });
});

test("--dry sigue siendo simulacro", () => {
  assert.equal(modoMigracion(["--dry"], { MONGODB_DB_NAME: "test" }).dry, true);
});

test("--aplicar escribe en la base de desarrollo", () => {
  assert.equal(modoMigracion(["--aplicar"], { MONGODB_DB_NAME: "test" }).dry, false);
});

test("aplicar en producción exige repetir el nombre de la base", () => {
  assert.throws(() => modoMigracion(["--aplicar"], { MONGODB_DB_NAME: "rincones" }), /--confirmo-destino=rincones/);
  assert.equal(modoMigracion(["--aplicar", "--confirmo-destino=rincones"], { MONGODB_DB_NAME: "rincones" }).dry, false);
});

test("simular en producción no pide confirmación", () => {
  assert.equal(modoMigracion([], { MONGODB_DB_NAME: "rincones" }).dry, true);
});

test("--dry y --aplicar juntos se contradicen", () => {
  assert.throws(() => modoMigracion(["--dry", "--aplicar"], { MONGODB_DB_NAME: "test" }), /contradicen/);
});
