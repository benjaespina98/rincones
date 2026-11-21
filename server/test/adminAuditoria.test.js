const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);
const ChangeLog = require("../src/models/changeLog.model");
const User = require("../src/models/user.model");
const accountDeletion = require("../src/services/accountDeletion.service");
const admin = require("../src/controllers/admin.controller");

/**
 * Lo que el panel de admin deja en el registro de auditoría (que no caduca) y cómo se valida un borrado en lote:
 * mail enmascarado, sin nombre, sin el id de la cuenta borrada; ids que no son ObjectId no llegan a la base.
 */

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const conStub = async (pares, fn) => {
  const orig = pares.map(([o, k]) => [o, k, o[k]]);
  pares.forEach(([o, k, v]) => { o[k] = v; });
  try { await fn(); } finally { orig.forEach(([o, k, f]) => { o[k] = f; }); }
};

const ADMIN = { id: "64b7f0c2a1b2c3d4e5f60001", email: "admin@rincones.app" };
const ID_A = "64b7f0c2a1b2c3d4e5f60002";
const ID_B = "64b7f0c2a1b2c3d4e5f60003";

test("cambiar un rol guarda el mail ENMASCARADO en el registro", async () => {
  const logs = [];
  const usuario = { _id: ID_A, email: "juan.perez@gmail.com", role: "user", firstName: "Juan", save: async () => {} };
  await conStub(
    [[User, "findById", async () => usuario], [ChangeLog, "create", async (d) => logs.push(d)]],
    async () => {
      const res = responder();
      await admin.updateUserRole({ params: { userId: ID_A }, body: { role: "admin" }, user: ADMIN }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 200);
      assert.equal(logs[0].after.targetEmail, "ju***@gmail.com");
      assert.ok(!JSON.stringify(logs[0]).includes("perez"));
      assert.ok(!JSON.stringify(logs[0]).includes("Juan"));
      assert.equal(String(logs[0].entityId), ID_A, "el cambio de rol sigue apuntando a la cuenta viva");
    }
  );
});

test("borrar un usuario desde el panel: registro con mail enmascarado, SIN firstName y con un entityId que no es el de la cuenta", async () => {
  const logs = [];
  const usuario = { _id: ID_A, email: "juan.perez@gmail.com", role: "user", firstName: "Juan" };
  await conStub(
    [
      [User, "findById", async () => usuario],
      [User, "countDocuments", async () => 2],
      [User, "deleteOne", async () => ({ deletedCount: 1 })],
      [ChangeLog, "create", async (d) => logs.push(d)],
      [accountDeletion, "purgeUserLeftovers", async () => {}],
      [accountDeletion, "imagenesPropias", async () => []],
      [accountDeletion, "borrarDatosPropios", async () => {}],
      [accountDeletion, "limpiarImagenes", async () => {}],
      [mongoose, "startSession", async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} })],
    ],
    async () => {
      const res = responder();
      await admin.deleteUser({ params: { userId: ID_A }, user: ADMIN }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(logs[0].before, { email: "ju***@gmail.com", role: "user" });
      assert.notEqual(String(logs[0].entityId), ID_A);
      assert.ok(!JSON.stringify(logs[0]).includes("Juan"));
    }
  );
});

test("bulkDeleteUsers valida cada id: objetos, números y basura no llegan a findById y se informan como fallidos", async () => {
  const buscados = [];
  const logs = [];
  await conStub(
    [
      [User, "findById", async (id) => { buscados.push(id); return { _id: id, email: "ana.gomez@x.com", role: "user", firstName: "Ana" }; }],
      [User, "countDocuments", async () => 2],
      [User, "deleteOne", async () => ({})],
      [ChangeLog, "create", async (d) => logs.push(d)],
      [accountDeletion, "purgeUserLeftovers", async () => {}],
      [accountDeletion, "imagenesPropias", async () => []],
      [accountDeletion, "borrarDatosPropios", async () => {}],
      [accountDeletion, "limpiarImagenes", async () => {}],
    ],
    async () => {
      const res = responder();
      await admin.bulkDeleteUsers(
        { body: { ids: [ID_A, ID_A, { $ne: null }, 42, "no-es-un-id", ID_B] }, user: ADMIN },
        res,
        (e) => { throw e; }
      );
      assert.equal(res.statusCode, 200);
      assert.deepEqual(buscados, [ID_A, ID_B], "sólo los válidos, sin repetidos");
      assert.equal(res.body.data.deleted.length, 2);
      assert.ok(res.body.data.failed.some((f) => f.reason === "Id inválido" && f.userId === "no-es-un-id"));
      assert.ok(res.body.data.failed.some((f) => /no son un id/.test(f.reason)));
      assert.deepEqual(logs[0].before, { email: "an***@x.com", role: "user" });
      assert.ok(logs.every((l) => !JSON.stringify(l).includes("Ana")));
    }
  );
});

test("bulkDeleteUsers: lista vacía o sin body da 400, y más de 100 también", async () => {
  for (const body of [undefined, {}, { ids: [] }, { ids: [null, "", 0] }]) {
    const res = responder();
    await admin.bulkDeleteUsers({ body, user: ADMIN }, res, (e) => { throw e; });
    assert.equal(res.statusCode, 400);
  }
  const res = responder();
  await admin.bulkDeleteUsers({ body: { ids: Array.from({ length: 101 }, () => ID_A) }, user: ADMIN }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 400);
});

test("getChangeLogs: buscar el mail ENTERO encuentra el registro guardado enmascarado", async () => {
  let filtro;
  const consulta = { sort: () => consulta, skip: () => consulta, limit: () => consulta, lean: async () => [] };
  await conStub([[ChangeLog, "find", (f) => { filtro = f; return consulta; }], [ChangeLog, "countDocuments", async () => 0]], async () => {
    await admin.getChangeLogs({ query: { q: "juan.perez@gmail.com" } }, responder(), (e) => { throw e; });
    assert.ok(filtro.$or.some((c) => c["after.targetEmail"] === "ju***@gmail.com"));
    assert.ok(filtro.$or.some((c) => c["before.email"] === "ju***@gmail.com"));
    // La búsqueda parcial y por dominio sigue funcionando por regex.
    await admin.getChangeLogs({ query: { q: "@gmail.com" } }, responder(), (e) => { throw e; });
    assert.ok(filtro.$or.some((c) => c["before.email"] instanceof RegExp && c["before.email"].test("ju***@gmail.com")));
  });
});
