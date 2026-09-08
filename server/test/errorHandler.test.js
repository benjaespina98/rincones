const test = require("node:test");
const assert = require("node:assert/strict");
const errorHandler = require("../src/middleware/errorHandler");

/**
 * ── EL ÚLTIMO FILTRO ANTES DE CONTESTARLE A LA PERSONA ──────────────────────
 * Reglas cortas y cada una con su propio motivo real (ver los comentarios del
 * archivo): un error que la persona puede corregir se explica con esas
 * palabras; uno interno nunca cuenta de más. Estos tests fijan una rama por
 * vez, con el request/response mínimo que hace falta para llegar a ella —el
 * resto del middleware (Sentry, `recordError`, el flush) sólo corre en la
 * rama del 500 genérico, así que las ramas de 4xx no necesitan mockear nada
 * de eso.
 */

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const req = { method: "POST", originalUrl: "/api/auth/register" };
const next = () => { throw new Error("no debería llegar acá"); };

test("un choque contra el email único se contesta como 'ya está registrado', no como un 500", async () => {
  // La forma real de un error de Mongo/Mongoose por índice único: `code`
  // 11000 y `keyValue` con el campo que chocó.
  const err = Object.assign(new Error("E11000 duplicate key error collection: rincones.users"), {
    code: 11000,
    keyValue: { email: "vos@rincones.app" },
  });

  const res = responder();
  await errorHandler(err, req, res, next);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "El email ya está registrado");
  // Nada del mensaje crudo de Mongo (nombre de colección, "E11000") llega al
  // cliente: es exactamente lo que este archivo existe para evitar.
  assert.ok(!JSON.stringify(res.body).includes("E11000"));
});

test("un índice único que no es el email contesta algo genérico pero igual de claro", async () => {
  const err = Object.assign(new Error("duplicate key"), {
    code: 11000,
    keyValue: { key: "malbec::rutini::mendoza" },
  });

  const res = responder();
  await errorHandler(err, req, res, next);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /ya existe/i);
});

test("un 11000 sin keyValue no revienta el handler", async () => {
  const err = Object.assign(new Error("duplicate key"), { code: 11000 });

  const res = responder();
  await errorHandler(err, req, res, next);

  assert.equal(res.statusCode, 409);
  assert.ok(res.body.message);
});

test("un ValidationError de Mongoose sigue devolviendo la lista de campos", async () => {
  const err = Object.assign(new Error("falló la validación"), {
    name: "ValidationError",
    errors: { email: { message: "Email inválido" } },
  });

  const res = responder();
  await errorHandler(err, req, res, next);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.errors, ["Email inválido"]);
});
