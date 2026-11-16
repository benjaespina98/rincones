const test = require("node:test");
const assert = require("node:assert/strict");
const { validarVino } = require("../src/utils/validarVino");
const { fail } = require("../src/utils/apiError");

const AHORA = new Date("2026-10-19T12:00:00Z");
const v = (body, opts) => validarVino(body, { ahora: AHORA, ...opts });

test("un vino normal pasa; los campos vacíos u omitidos no molestan", () => {
  assert.equal(v({ name: "Saint Felicien", winery: "Catena", vintage: 2019, quantity: 3, price: 12000, rating: 4 }), null);
  assert.equal(v({ name: "X", vintage: null, price: "", rating: undefined }), null);
});

test("el nombre es obligatorio al crear, pero no al editar otro campo", () => {
  assert.match(v({}), /obligatorio/);
  assert.match(v({ name: "   " }), /obligatorio/);
  assert.equal(v({ notes: "hola" }, { parcial: true }), null);
  assert.match(v({ name: "  " }, { parcial: true }), /obligatorio/);
});

test("cosecha: de 1900 al año que viene", () => {
  for (const vintage of [1899, 2028, 3000, "abc", 2019.5]) assert.match(v({ name: "X", vintage }), /cosecha/i, String(vintage));
  for (const vintage of [1900, 2027, "2019"]) assert.equal(v({ name: "X", vintage }), null, String(vintage));
});

test("puntaje, precio y cantidad fuera de rango", () => {
  assert.match(v({ name: "X", rating: 99 }), /puntaje/i);
  assert.match(v({ name: "X", rating: -1 }), /puntaje/i);
  assert.match(v({ name: "X", price: -5 }), /precio/i);
  assert.match(v({ name: "X", price: "abc" }), /precio/i);
  assert.match(v({ name: "X", quantity: 1e9 }), /cantidad/i);
  assert.match(v({ name: "X", quantity: -2 }), /cantidad/i);
});

test("largos máximos: un nombre de 100.000 caracteres no entra", () => {
  assert.match(v({ name: "a".repeat(100000) }), /demasiado largo/);
  assert.match(v({ name: "ok", winery: "b".repeat(121) }), /La bodega es demasiado larga/);
  assert.match(v({ name: "ok", notes: "n".repeat(4001) }), /Las notas son demasiado largas/);
  assert.equal(v({ name: "a".repeat(120) }), null);
});

test("beber desde no puede ser posterior a beber hasta", () => {
  assert.match(v({ name: "X", drinkFrom: 2030, drinkUntil: 2020 }), /Beber desde/);
  assert.equal(v({ name: "X", drinkFrom: 2020, drinkUntil: 2030 }), null);
  assert.equal(v({ name: "X", drinkFrom: 2025 }), null);
  assert.match(v({ name: "X", drinkUntil: 99999 }), /año válido/);
});

test("texto raro no se rechaza (la UI escapa): sólo se acota el largo", () => {
  assert.equal(v({ name: '<script>alert(1)</script> "comillas" 🍷 ñandú' }), null);
});

test("fail(): un id mal formado es 404 y un valor inválido de Mongoose es 400, no 500", async () => {
  const res = () => {
    const r = { code: 0, body: null };
    r.status = (c) => ((r.code = c), r);
    r.json = (b) => ((r.body = b), r);
    return r;
  };
  const a = res();
  await fail(a, { name: "CastError" });
  assert.equal(a.code, 404);
  const b = res();
  await fail(b, { name: "ValidationError", errors: { x: { message: "Valor fuera de rango" } } });
  assert.equal(b.code, 400);
  assert.match(b.body.error, /fuera de rango/);
  const c = res();
  await fail(c, new Error("boom"));
  assert.equal(c.code, 500);
});

test("un campo de texto que llega como objeto o lista se rechaza", () => {
  const { validarVino } = require("../src/utils/validarVino");
  assert.ok(validarVino({ name: { $gt: "" } }));
  assert.ok(validarVino({ name: "Malbec", notes: ["a"] }));
  assert.ok(validarVino({ name: "Malbec", winery: { x: 1 } }, { parcial: true }));
  assert.equal(validarVino({ name: "Malbec", notes: null }), null);
});

test("image, rawText, currency y cellarShelf que llegan como objeto o lista se rechazan (antes daban 500)", () => {
  for (const campo of ["image", "rawText", "currency", "cellarShelf"]) {
    assert.equal(validarVino({ name: "Malbec", [campo]: { $gt: "" } }), "Hay un dato que no es un texto válido", campo);
    assert.equal(validarVino({ name: "Malbec", [campo]: ["a"] }), "Hay un dato que no es un texto válido", campo);
    assert.equal(validarVino({ name: "Malbec", [campo]: "texto" }), null, campo);
    assert.equal(validarVino({ name: "Malbec", [campo]: null }), null, campo);
  }
});
