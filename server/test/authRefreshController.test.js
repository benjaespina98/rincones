const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const sessions = require("../src/services/session.service");
const { refresh } = require("../src/controllers/auth.controller");

/**
 * El controlador `refresh`: lo que decide si una sesión sigue o se corta. La rotación (qué es
 * reuso y qué es un reintento) se prueba en sessionRotation.test.js; acá se fija qué hace el
 * controlador con cada respuesta de esa rotación.
 */
const ORIGINAL_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = "secreto-de-prueba"; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

const crearRes = () => {
  const r = { statusCode: 200, cuerpo: null, cookies: [], limpias: [] };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  r.cookie = (n, v, o) => { r.cookies.push({ n, v, o }); return r; };
  r.clearCookie = (n) => { r.limpias.push(n); return r; };
  return r;
};

const conRotacion = async ({ rotado, usuario = null, borrados = [] }, req = { cookies: { refreshToken: "viejo" }, get: () => "ua" }) => {
  const orig = { rotate: sessions.rotateRefreshToken, revoke: sessions.revokeAllForUser, find: User.findById };
  sessions.rotateRefreshToken = async () => rotado;
  sessions.revokeAllForUser = async (id) => { borrados.push(id); };
  User.findById = async () => usuario;
  const res = crearRes();
  let error = null;
  try {
    await refresh(req, res, (e) => { error = e; });
  } finally {
    sessions.rotateRefreshToken = orig.rotate;
    sessions.revokeAllForUser = orig.revoke;
    User.findById = orig.find;
  }
  return { res, error };
};

test("refresh: una sesión desconocida o vencida es 401 y limpia las cookies", async () => {
  const { res } = await conRotacion({ rotado: null });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.limpias.sort(), ["authToken", "refreshToken"]);
  assert.equal(res.cookies.length, 0);
});

test("refresh: un reuso es 401, limpia cookies y NO entrega tokens (ni dice que lo detectó)", async () => {
  const { res } = await conRotacion({ rotado: { reused: true, userId: "u1" } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.cuerpo.message, "Sesión expirada");
  assert.equal(res.cookies.length, 0);
  assert.equal(res.limpias.length, 2);
});

test("refresh: si la cuenta ya no existe, cierra todas sus sesiones y es 401", async () => {
  const borrados = [];
  const { res } = await conRotacion({ rotado: { userId: "u9", token: "nuevo", expiresAt: new Date() }, usuario: null, borrados });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(borrados, ["u9"]);
});

test("refresh: la rotación buena entrega token de acceso, y el refresh nuevo SÓLO en cookie", async () => {
  const usuario = { _id: "u1", email: "a@b.com", role: "user", firstName: "A", toObject() { return this; } };
  const expira = new Date(Date.now() + 86400000);
  const { res, error } = await conRotacion({ rotado: { userId: "u1", token: "refresh-nuevo", expiresAt: expira }, usuario });
  assert.equal(error, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.cuerpo.data?.token, undefined, "el token de acceso va sólo en cookie");
  assert.ok(!JSON.stringify(res.cuerpo).includes("refresh-nuevo"), "el refresh nunca va en el body");
  const refrescoCookie = res.cookies.find((c) => c.n === "refreshToken");
  assert.equal(refrescoCookie.v, "refresh-nuevo");
  assert.equal(refrescoCookie.o.httpOnly, true);
  assert.equal(refrescoCookie.o.path, "/api/auth");
  assert.ok(res.cookies.find((c) => c.n === "authToken"));
});

test("refresh: sin cookie de refresh pasa por la rotación con undefined y termina en 401", async () => {
  const { res } = await conRotacion({ rotado: null }, { cookies: undefined, get: () => "" });
  assert.equal(res.statusCode, 401);
});

test("refresh: si la base falla el error va al manejador, sin cookies nuevas", async () => {
  const orig = sessions.rotateRefreshToken;
  sessions.rotateRefreshToken = async () => { throw new Error("db caída"); };
  const res = crearRes();
  let error = null;
  try {
    await refresh({ cookies: { refreshToken: "x" }, get: () => "" }, res, (e) => { error = e; });
  } finally {
    sessions.rotateRefreshToken = orig;
  }
  assert.ok(error);
  assert.equal(res.cookies.length, 0);
});
