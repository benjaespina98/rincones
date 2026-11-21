const test = require("node:test");
const assert = require("node:assert/strict");
const ChangeLog = require("../src/models/changeLog.model");
const ErrorLog = require("../src/models/errorLog.model");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const WineReview = require("../src/models/wineReview.model");
const admin = require("../src/controllers/admin.controller");

/**
 * Listados del panel de admin: paginación a prueba de basura, fechas en calendario argentino y
 * separación entre admins y usuarios comunes en el registro de actividad.
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
const consulta = (rows, captura) => {
  const c = {
    sort: () => c,
    skip: (n) => { captura.skip = n; return c; },
    limit: (n) => { captura.limit = n; return c; },
    select: () => c,
    lean: async () => rows,
  };
  return c;
};

test("getChangeLogs: page=0, texto o límite absurdo no rompen (antes: 500)", async () => {
  for (const query of [{ page: "0" }, { page: "abc", limit: "xyz" }, { page: "-3", limit: "-1" }, { limit: "99999" }]) {
    const cap = {};
    await conStub(
      [[ChangeLog, "find", () => consulta([], cap)], [ChangeLog, "countDocuments", async () => 0]],
      async () => {
        const res = responder();
        await admin.getChangeLogs({ query }, res, (e) => { throw e; });
        assert.equal(res.statusCode, 200);
        assert.ok(cap.skip >= 0, `skip válido para ${JSON.stringify(query)}`);
        assert.ok(cap.limit >= 1 && cap.limit <= 100);
        assert.ok(res.body.pagination.page >= 1);
      }
    );
  }
});

test("getUsers, getReviews y getErrorLogs aceptan page=0 sin explotar (cada uno con SU captura)", async () => {
  // Un `cap` por función: con uno compartido, un `skip` que quedó de la anterior hacía pasar la aserción.
  const caps = new Map();
  const cap = new Proxy({}, {
    get: (_, k) => caps.get(actual)?.[k],
    set: (_, k, v) => { caps.set(actual, { ...(caps.get(actual) || {}), [k]: v }); return true; },
  });
  let actual = null;
  await conStub(
    [
      [User, "find", () => consulta([], cap)],
      [User, "aggregate", async () => [{ total: [], admins: [] }]],
      [Wine, "aggregate", async () => []],
      [WineReview, "aggregate", async () => []],
      [WineReview, "find", () => consulta([], cap)],
      [WineReview, "countDocuments", async () => 0],
      [ErrorLog, "find", () => consulta([], cap)],
      [ErrorLog, "countDocuments", async () => 0],
    ],
    async () => {
      for (const fn of [admin.getUsers, admin.getReviews, admin.getErrorLogs]) {
        actual = fn;
        const res = responder();
        await fn({ query: { page: "0", limit: "abc" }, user: { id: "x" } }, res, (e) => { throw e; });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.pagination.page, 1);
        assert.equal(caps.get(fn)?.skip, 0, `${fn.name}: skip 0`);
      }
    }
  );
});

test("getChangeLogs: las fechas son del calendario argentino (el mismo corte que las métricas)", async () => {
  let filtro;
  await conStub(
    [[ChangeLog, "find", (f) => { filtro = f; return consulta([], {}); }], [ChangeLog, "countDocuments", async () => 0]],
    async () => {
      await admin.getChangeLogs({ query: { from: "2026-03-05", to: "2026-03-05" } }, responder(), (e) => { throw e; });
      assert.equal(filtro.createdAt.$gte.toISOString(), "2026-03-05T03:00:00.000Z");
      assert.equal(filtro.createdAt.$lte.toISOString(), "2026-03-06T02:59:59.999Z");
    }
  );
});

test("getErrorLogs: mismo corte de fechas, y una fecha inválida se ignora", async () => {
  let filtro;
  await conStub(
    [[ErrorLog, "find", (f) => { filtro = f; return consulta([], {}); }], [ErrorLog, "countDocuments", async () => 0]],
    async () => {
      await admin.getErrorLogs({ query: { to: "2026-03-05" } }, responder(), (e) => { throw e; });
      assert.equal(filtro.createdAt.$lte.toISOString(), "2026-03-06T02:59:59.999Z");
      assert.equal(filtro.createdAt.$gte, undefined);
      await admin.getErrorLogs({ query: { from: "ayer", to: "2026-99-99" } }, responder(), (e) => { throw e; });
      assert.equal(filtro.createdAt, undefined);
    }
  );
});

test("getChangeLogs: actorRole separa admins de usuarios comunes", async () => {
  const filtros = [];
  await conStub(
    [[ChangeLog, "find", (f) => { filtros.push(f); return consulta([], {}); }], [ChangeLog, "countDocuments", async () => 0]],
    async () => {
      for (const actorRole of ["user", "admin", "otro", ""]) {
        await admin.getChangeLogs({ query: { actorRole } }, responder(), (e) => { throw e; });
      }
      assert.equal(filtros[0]["actor.role"], "user");
      assert.deepEqual(filtros[1]["actor.role"], { $ne: "user" }, "los registros viejos sin rol cuentan como admin");
      assert.equal(filtros[2]["actor.role"], undefined, "un valor desconocido no filtra");
      assert.equal(filtros[3]["actor.role"], undefined);
    }
  );
});

test("getChangeLogActors: `data` sigue siendo la lista de mails y `details` suma el rol", async () => {
  const filas = [
    { _id: "zeta@x.com", role: "user" },
    { _id: "ana@x.com", role: "admin" },
    { _id: "viejo@x.com", role: undefined },
    { _id: null, role: "admin" },
  ];
  await conStub([[ChangeLog, "aggregate", async () => filas]], async () => {
    const todos = responder();
    await admin.getChangeLogActors({ query: {} }, todos, (e) => { throw e; });
    assert.deepEqual(todos.body.data, ["ana@x.com", "viejo@x.com", "zeta@x.com"]);
    assert.deepEqual(todos.body.details, [
      { email: "ana@x.com", role: "admin" },
      { email: "viejo@x.com", role: "admin" },
      { email: "zeta@x.com", role: "user" },
    ]);

    const soloAdmins = responder();
    await admin.getChangeLogActors({ query: { role: "admin" } }, soloAdmins, (e) => { throw e; });
    assert.deepEqual(soloAdmins.body.data, ["ana@x.com", "viejo@x.com"]);

    const soloUsuarios = responder();
    await admin.getChangeLogActors({ query: { role: "user" } }, soloUsuarios, (e) => { throw e; });
    assert.deepEqual(soloUsuarios.body.data, ["zeta@x.com"]);
  });
});
