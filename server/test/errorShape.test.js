const test = require("node:test");
const assert = require("node:assert/strict");
const { errorShape, normalizarError } = require("../src/middleware/errorShape");

test("un error con `error` también trae `message`, y al revés", () => {
  assert.deepEqual(normalizarError(404, { success: false, error: "No existe" }), {
    success: false,
    error: "No existe",
    message: "No existe",
  });
  assert.deepEqual(normalizarError(400, { message: "Falta algo" }), {
    success: false,
    message: "Falta algo",
    error: "Falta algo",
  });
});

test("lo que no es un error no se toca", () => {
  const ok = { data: [1, 2], error: "no es un error" };
  assert.equal(normalizarError(200, ok), ok);
  assert.deepEqual(normalizarError(500, [1]), [1]);
});

test("si ya trae los dos textos no se pisan", () => {
  const r = normalizarError(400, { success: false, message: "A", error: "B" });
  assert.equal(r.message, "A");
  assert.equal(r.error, "B");
});

test("el middleware envuelve res.json según el status", () => {
  let enviado;
  const res = { statusCode: 404, json: (b) => { enviado = b; } };
  errorShape({}, res, () => {});
  res.json({ error: "No encontrado" });
  assert.equal(enviado.message, "No encontrado");
  assert.equal(enviado.success, false);
});
