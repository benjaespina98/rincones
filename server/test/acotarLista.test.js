const test = require("node:test");
const assert = require("node:assert/strict");
const { acotarLista } = require("../src/utils/acotarLista");

test("recorta cada ítem a 40 caracteres y descarta los vacíos", () => {
  const r = acotarLista(["a".repeat(500), "   ", "", "Malbec", null, undefined]);
  assert.equal(r.length, 2);
  assert.equal(r[0].length, 40);
  assert.equal(r[1], "Malbec");
});

test("respeta el máximo de ítems", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => `uva ${i}`);
  assert.equal(acotarLista(muchos, { items: 10 }).length, 10);
  assert.equal(acotarLista(muchos, { items: 20 }).length, 20);
});

test("los espacios de los bordes no cuentan, lo vacío se descarta y lo que no es lista da lista vacía", () => {
  assert.deepEqual(acotarLista([" ".repeat(60) + "x"]), ["x"]);
  assert.deepEqual(acotarLista(["   ", ""]), []);
  assert.deepEqual(acotarLista("Malbec"), []);
  assert.deepEqual(acotarLista(null), []);
  assert.deepEqual(acotarLista([42, { a: 1 }]), ["42", "[object Object]"]);
});
