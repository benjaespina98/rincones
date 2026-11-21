const test = require("node:test");
const assert = require("node:assert/strict");
const { leerPaginacion, MAX_PAGINA } = require("../src/utils/paginacion");

/** page=0 o texto llegaban a Mongo como skip negativo/NaN y volvían como un 500. */

test("valores válidos pasan tal cual", () => {
  assert.deepEqual(leerPaginacion({ page: "3", limit: "10" }), { page: 3, limit: 10, skip: 20 });
});

test("sin parámetros, los valores por defecto del listado", () => {
  assert.deepEqual(leerPaginacion({}, { porDefecto: 30 }), { page: 1, limit: 30, skip: 0 });
  assert.deepEqual(leerPaginacion(undefined), { page: 1, limit: 20, skip: 0 });
});

test("cero, negativos, texto, vacío y NaN caen al valor por defecto", () => {
  for (const malo of ["0", "-4", "abc", "", "NaN", "Infinity", null, {}, []]) {
    const r = leerPaginacion({ page: malo, limit: malo });
    assert.equal(r.page, 1, `page=${JSON.stringify(malo)}`);
    assert.equal(r.limit, 20, `limit=${JSON.stringify(malo)}`);
    assert.equal(r.skip, 0);
  }
});

test("el límite se acota al máximo y los decimales se redondean hacia abajo", () => {
  assert.equal(leerPaginacion({ limit: "5000" }, { maximo: 100 }).limit, 100);
  assert.equal(leerPaginacion({ limit: "7.9", page: "2.5" }).limit, 7);
  assert.equal(leerPaginacion({ limit: "7.9", page: "2.5" }).page, 2);
  assert.equal(leerPaginacion({ page: "99999999999" }).page, MAX_PAGINA);
});
