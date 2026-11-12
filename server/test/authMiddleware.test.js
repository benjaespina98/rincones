const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const User = require("../src/models/user.model");
const { authenticate, optionalAuth, requireAdmin } = require("../src/middleware/auth.middleware");

/**
 * `authenticate` y `requireAdmin` eran el borde de seguridad sin un solo test: cambiar
 * `jwt.verify` por `jwt.decode` no rompía nada. Estas pruebas fijan lo que hace que un token
 * sirva (firma, vencimiento, algoritmo) y que el rol de admin se lea de la BASE.
 */
const SECRET = "secreto-de-prueba";
const ORIGINAL_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

const firmar = (payload = { sub: "u1", email: "a@b.com", role: "user" }, opciones = { expiresIn: "5m" }, secreto = SECRET) =>
  jwt.sign(payload, secreto, opciones);

const crearRes = () => {
  const r = { statusCode: null, cuerpo: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
};

const correr = (middleware, req) => {
  const res = crearRes();
  let siguio = false;
  const resultado = middleware(req, res, () => { siguio = true; });
  return Promise.resolve(resultado).then(() => ({ res, siguio }));
};

test("authenticate: sin token es 401 y no sigue", async () => {
  const { res, siguio } = await correr(authenticate, { headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(siguio, false);
});

test("authenticate: un token válido por Bearer deja req.user y sigue", async () => {
  const req = { headers: { authorization: `Bearer ${firmar()}` } };
  const { siguio } = await correr(authenticate, req);
  assert.equal(siguio, true);
  assert.deepEqual(req.user, { id: "u1", email: "a@b.com", role: "user" });
});

test("authenticate: cae a la cookie si no hay Bearer", async () => {
  const req = { headers: {}, cookies: { authToken: firmar() } };
  const { siguio } = await correr(authenticate, req);
  assert.equal(siguio, true);
  assert.equal(req.user.id, "u1");
});

test("authenticate: un token firmado con OTRA clave es 401 (verify, no decode)", async () => {
  const req = { headers: { authorization: `Bearer ${firmar(undefined, undefined, "otra-clave")}` } };
  const { res, siguio } = await correr(authenticate, req);
  assert.equal(res.statusCode, 401);
  assert.equal(siguio, false);
  assert.equal(req.user, undefined);
});

test("authenticate: un token vencido es 401", async () => {
  const vencido = firmar({ sub: "u1" }, { expiresIn: -10 });
  const { res, siguio } = await correr(authenticate, { headers: { authorization: `Bearer ${vencido}` } });
  assert.equal(res.statusCode, 401);
  assert.equal(siguio, false);
});

test("authenticate: un token sin firma (alg none) es 401", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sinFirma = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "u1", role: "admin" })}.`;
  const { res, siguio } = await correr(authenticate, { headers: { authorization: `Bearer ${sinFirma}` } });
  assert.equal(res.statusCode, 401);
  assert.equal(siguio, false);
});

test("authenticate: basura en el header es 401", async () => {
  const { res } = await correr(authenticate, { headers: { authorization: "Bearer no.es.un.jwt" } });
  assert.equal(res.statusCode, 401);
});

test("optionalAuth: nunca corta; con token inválido sigue como anónimo", async () => {
  const req = { headers: { authorization: "Bearer basura" } };
  const { siguio } = await correr(optionalAuth, req);
  assert.equal(siguio, true);
  assert.equal(req.user, undefined);

  const bueno = { headers: { authorization: `Bearer ${firmar()}` } };
  await correr(optionalAuth, bueno);
  assert.equal(bueno.user.id, "u1");
});

const conRolEnBase = async (usuario, fn) => {
  const original = User.findById;
  User.findById = () => ({ select: () => ({ lean: async () => usuario }) });
  try { return await fn(); } finally { User.findById = original; }
};

test("requireAdmin: sin req.user es 401", async () => {
  const { res, siguio } = await correr(requireAdmin, {});
  assert.equal(res.statusCode, 401);
  assert.equal(siguio, false);
});

test("requireAdmin: una cuenta borrada es 401", async () => {
  await conRolEnBase(null, async () => {
    const { res, siguio } = await correr(requireAdmin, { user: { id: "u1", role: "admin" } });
    assert.equal(res.statusCode, 401);
    assert.equal(siguio, false);
  });
});

test("requireAdmin: manda el rol de la BASE, no el del token (admin degradado = 403)", async () => {
  await conRolEnBase({ role: "user" }, async () => {
    const { res, siguio } = await correr(requireAdmin, { user: { id: "u1", role: "admin" } });
    assert.equal(res.statusCode, 403);
    assert.equal(siguio, false);
  });
});

test("requireAdmin: un admin de verdad pasa, aunque el token diga otra cosa", async () => {
  await conRolEnBase({ role: "admin" }, async () => {
    const req = { user: { id: "u1", role: "user" } };
    const { siguio } = await correr(requireAdmin, req);
    assert.equal(siguio, true);
    assert.equal(req.user.role, "admin");
  });
});

test("requireAdmin: si la base falla, el error va al manejador (no abre la puerta)", async () => {
  const original = User.findById;
  User.findById = () => ({ select: () => ({ lean: async () => { throw new Error("db caída"); } }) });
  const res = crearRes();
  let error = null;
  let siguio = false;
  try {
    await requireAdmin({ user: { id: "u1" } }, res, (e) => { if (e) error = e; else siguio = true; });
  } finally {
    User.findById = original;
  }
  assert.ok(error);
  assert.equal(siguio, false);
});
