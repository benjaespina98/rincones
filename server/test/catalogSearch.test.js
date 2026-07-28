const test = require("node:test");
const assert = require("node:assert");
const { searchCatalog } = require("../src/services/catalog.service");

// La búsqueda es una de las funciones centrales de la app y no tenía red de
// seguridad: un cambio en el scoring o en el haystack rompía en silencio.

test("encuentra por bodega, varietal, región y tipo", () => {
  for (const q of ["catena", "malbec", "cafayate", "tinto"]) {
    assert.ok(searchCatalog(q).length > 0, `"${q}" no devolvió nada`);
  }
});

test("todos los términos deben coincidir: 'catena malbec' no trae Cabernet", () => {
  const r = searchCatalog("catena malbec");
  assert.ok(r.length > 0);
  assert.ok(
    r.every((w) => /malbec/i.test(`${w.name} ${w.varietal}`)),
    "se coló un vino que no es Malbec"
  );
});

test("tolera un dedazo", () => {
  for (const [malo, esperado] of [
    ["zucardi", /zuccardi/i],
    ["malbek", /malbec/i],
    ["luigi boska", /luigi bosca/i],
    ["cabernet sauvingon", /cabernet/i],
  ]) {
    const r = searchCatalog(malo);
    assert.ok(r.length > 0, `"${malo}" no devolvió nada`);
    assert.match(`${r[0].name} ${r[0].winery}`, esperado);
  }
});

test("lo exacto siempre le gana a lo aproximado", () => {
  // Si hay coincidencia exacta no se entra siquiera al paso difuso.
  const r = searchCatalog("rutini");
  assert.ok(r.every((w) => /rutini/i.test(`${w.name} ${w.winery}`)));
});

test("no inventa resultados para algo que no existe", () => {
  assert.strictEqual(searchCatalog("xyzqw").length, 0);
  assert.strictEqual(searchCatalog("").length, 0);
});

test("responde rápido incluso con dedazo (peor caso: recorre todo el catálogo)", () => {
  const t0 = Date.now();
  for (let i = 0; i < 20; i += 1) searchCatalog("cabernet sauvingon");
  assert.ok(Date.now() - t0 < 1000, "20 búsquedas difusas tardaron más de 1s");
});
