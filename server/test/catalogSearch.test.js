const test = require("node:test");
const assert = require("node:assert");
const { searchCatalog, findMatch } = require("../src/services/catalog.service");

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
    // La uva se mira en su campo: el nombre visible ya no la incluye.
    assert.match(`${r[0].name} ${r[0].winery} ${r[0].varietal}`, esperado);
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

/**
 * ── EL ENRIQUECIDO DEL ESCANEO ──────────────────────────────────────────────
 * `findMatch` corre entre que sacás la foto y que aparece la revisión, y decide
 * con qué se completan los huecos de la lectura. Dos cosas tienen que valer
 * siempre: que mire sólo lo local (rápido) y que una lectura más detallada de la
 * etiqueta no dé un resultado peor.
 *
 * El catálogo comunitario se corta en seco: sin él queda el curado, que es lo
 * que estos casos verifican. Se anula la consulta en vez de dejar que falle
 * sola porque, sin conexión, Mongoose la BUFFEREA y recién se rinde a los 10
 * segundos — el resultado es el mismo pero cada test tardaba eso.
 */
const CommunityWine = require("../src/models/communityWine.model");
CommunityWine.find = () => {
  throw new Error("sin base en los tests");
};
test("una lectura verbosa de la uva encuentra igual la fila curada", async () => {
  // "Blend de tintas" es una lectura CORRECTA del Pispi, y el catálogo dice
  // "Blend". Antes eso descartaba la fila curada por el veto de varietal y el
  // match caía en datos peores: la región terminaba siendo "Mendoza Argentina"
  // en vez de "Valle de Uco, Mendoza".
  const m = await findMatch({ winery: "Mosquita Muerta", line: "Pispi", varietal: "Blend de tintas" });

  assert.ok(m, "tendría que encontrar el Pispi del catálogo curado");
  assert.strictEqual(m.source, "catalogo-ar");
  assert.strictEqual(m.region, "Valle de Uco, Mendoza");
});

test("la bodega con y sin 'Bodega'/'Wines' llega al mismo vino", async () => {
  const conPrefijo = await findMatch({ winery: "Bodega Norton", line: "Privada", varietal: "Blend" });
  const sinPrefijo = await findMatch({ winery: "Norton", line: "Privada", varietal: "Corte" });

  assert.ok(conPrefijo && sinPrefijo);
  assert.strictEqual(conPrefijo.id, sinPrefijo.id, "es la misma botella");
});

test("no enriquece con otra botella: un corte con apellido no matchea el genérico", async () => {
  // "Gran Blend" es el corte alto de Rutini Apartado. Si colapsara en "Blend",
  // el escaneo del Apartado se completaría con los datos de otro vino.
  const m = await findMatch({ winery: "Rutini Wines", line: "Apartado", varietal: "Gran Blend" });

  assert.ok(m);
  assert.strictEqual(m.varietal, "Gran Blend");
});

test("prefiere no completar nada antes que completar con otra botella", async () => {
  const m = await findMatch({ winery: "Bodega Inventada XYZ", line: "Nada", varietal: "Malbec" });
  assert.strictEqual(m, null);
});
