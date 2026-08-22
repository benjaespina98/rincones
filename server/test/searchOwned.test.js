const test = require("node:test");
const assert = require("node:assert/strict");
const { anotarLoQueTenes } = require("../src/controllers/catalog.controller");

/**
 * El cruce entre lo que la búsqueda encuentra y lo que ya tenés.
 *
 * ── EL REPORTE QUE LO ORIGINÓ ───────────────────────────────────────────────
 * "Guardo un vino con cosecha 2023; en Mi Bodega aparece, en la búsqueda no."
 *
 * El síntoma era la cosecha, la causa era otra: la búsqueda no sabía qué vinos
 * ya eran del usuario. Y la cosecha NO puede vivir en el catálogo — la fila
 * comunitaria se identifica por nombre + uva + bodega, o sea que representa al
 * vino y no a la botella, y guardar un año ahí se lo mostraría a alguien que
 * tiene otra añada en la mano. La cosecha correcta está en TU vino; lo que
 * faltaba era cruzarlas.
 *
 * Estas pruebas fijan esa regla, que es la que hace que el mismo vino se
 * represente igual lo mires desde donde lo mires.
 */

const resultado = (over = {}) => ({
  id: "com-x",
  name: "Saint Felicien",
  winery: "Catena Zapata",
  varietal: "Malbec",
  vintage: "",
  ...over,
});

const mio = (over = {}) => ({
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Saint Felicien",
  winery: "Catena Zapata",
  varietal: "Malbec",
  vintage: 2023,
  quantity: 2,
  tasted: false,
  ...over,
});

test("la cosecha que guardaste aparece en la búsqueda del mismo vino", () => {
  const [r] = anotarLoQueTenes([resultado()], [mio()]);

  assert.ok(r.owned, "el resultado tiene que reconocerse como tuyo");
  assert.deepEqual(r.owned.vintages, [2023]);
  assert.equal(r.owned.bottles, 2);
});

test("un vino que no tenés queda sin marcar y sin inventarle cosecha", () => {
  const otro = resultado({ name: "Rutini", winery: "Rutini Wines" });
  const [r] = anotarLoQueTenes([otro], [mio()]);

  assert.equal(r.owned, undefined);
  assert.equal(r.vintage, "");
});

test("sin cosecha cargada no rompe: se reconoce igual, con la lista vacía", () => {
  const [r] = anotarLoQueTenes([resultado()], [mio({ vintage: null })]);

  assert.ok(r.owned);
  assert.deepEqual(r.owned.vintages, []);
  assert.equal(r.owned.bottles, 2);
});

test("dos añadas del mismo vino se muestran las dos, de la más nueva a la más vieja", () => {
  const mios = [
    mio({ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", vintage: 2019, quantity: 1 }),
    mio({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", vintage: 2023, quantity: 3 }),
  ];
  const [r] = anotarLoQueTenes([resultado()], mios);

  assert.deepEqual(r.owned.vintages, [2023, 2019]);
  // Las botellas se suman: son del mismo vino aunque sean dos filas.
  assert.equal(r.owned.bottles, 4);
  assert.equal(r.owned.entries, 2);
  // Se entra por la añada más nueva con stock.
  assert.equal(r.owned.id, "bbbbbbbbbbbbbbbbbbbbbbbb");
});

test("sin stock sigue siendo tuyo: se dice que lo probaste, no que lo quieras probar", () => {
  const [r] = anotarLoQueTenes([resultado()], [mio({ quantity: 0, tasted: true })]);

  assert.ok(r.owned);
  assert.equal(r.owned.bottles, 0);
  assert.equal(r.owned.tasted, true);
});

test("el mismo vino escrito con la uva adentro del nombre se reconoce igual", () => {
  // El nombre cambia según de dónde venga ("Saint Felicien" desde tu bodega,
  // "Saint Felicien Malbec" desde el catálogo). `poolKey` es lo que hace que las
  // dos formas converjan, y ésta es la prueba de que sigue haciéndolo.
  const desdeElCatalogo = resultado({ name: "Saint Felicien Malbec" });
  const [r] = anotarLoQueTenes([desdeElCatalogo], [mio()]);

  assert.ok(r.owned, "las dos formas del nombre son el mismo vino");
  assert.deepEqual(r.owned.vintages, [2023]);
});

test("otra uva de la misma línea NO es el mismo vino", () => {
  const cabernet = resultado({ varietal: "Cabernet Sauvignon" });
  const [r] = anotarLoQueTenes([cabernet], [mio()]);

  assert.equal(r.owned, undefined);
});

test("sin vinos cargados, los resultados salen tal cual entraron", () => {
  const entrada = [resultado()];
  const salida = anotarLoQueTenes(entrada, []);

  assert.equal(salida[0].owned, undefined);
  assert.equal(salida[0].name, "Saint Felicien");
});
