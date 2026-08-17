const test = require("node:test");
const assert = require("node:assert/strict");
const { identify, scoreCandidate, esGenerico } = require("../src/data/wineMatching");
const { CATALOG } = require("../src/data/argentineWines");

/**
 * ¿QUÉ BOTELLA ES ÉSTA?
 *
 * El banco de casos de la identificación. Son lecturas de etiqueta realistas
 * —con los errores que comete de verdad un lector de etiquetas— contra el
 * catálogo curado, y lo que se fija acá es la DECISIÓN: identificar solo,
 * preguntar, o admitir que no sabemos.
 *
 * El orden de prioridades que codifican estos tests, de mayor a menor:
 *
 *   1. no identificar mal    (un vino equivocado es peor que una pregunta)
 *   2. identificar bien      (la lectura buena tiene que seguir siendo un toque)
 *   3. preguntar cuando duda (con el candidato servido, no con un formulario)
 */

/** Los candidatos que el buscador real le pasaría al matcher, sin Mongo. */
const delCatalogo = (filtro) => CATALOG.filter(filtro).map(({ haystack, ...w }) => w);
const deBodega = (nombre) => delCatalogo((w) => w.winery === nombre);

const nombreDe = (r) => (r.best ? r.best.wine.line || r.best.wine.name : null);

// ── Lo que NO puede pasar ───────────────────────────────────────────────────

test("una etiqueta ilegible no se convierte en un vino concreto", () => {
  // El caso medido contra el catálogo real: de la foto sólo salió la uva y la
  // provincia. Antes esto devolvía "Trivento White Malbec" con 0.77 —porque
  // "malbec" estaba contenido en ese nombre— y le reescribía el nombre al vino
  // de una persona con una botella que nunca leyó.
  const r = identify(
    { winery: "", line: "Malbec", name: "", varietal: "Malbec", region: "Mendoza", type: "red" },
    delCatalogo((w) => w.varietal === "Malbec")
  );

  assert.equal(r.level, "ninguna");
  assert.equal(r.best, null);
});

test("'Reserva' no alcanza para elegir un vino de la bodega", () => {
  // La palabra está impresa en cientos de etiquetas de decenas de bodegas. Lo
  // único que ataría esta lectura a un vino concreto de Trapiche es la bodega,
  // la uva y la provincia — que es lo que comparten TODOS los Malbec de
  // Trapiche entre sí.
  const r = identify(
    { winery: "Trapiche", line: "Reserva", name: "", varietal: "Malbec", region: "Mendoza", type: "red" },
    deBodega("Trapiche")
  );

  assert.equal(r.level, "ninguna");
});

test("una bodega ajena veta el match aunque el nombre coincida entero", () => {
  const r = identify(
    { winery: "Rutini Wines", line: "Trapiche Broquel", name: "", varietal: "Malbec", region: "", type: "red" },
    deBodega("Trapiche")
  );

  assert.equal(r.level, "ninguna", "ningún nombre puede tapar que es otra bodega");
});

test("'Bodega' suelto no cuenta como bodega leída", () => {
  // Sin canonicalizar, "Bodega" contra "Bodega Norton" comparte una palabra y el
  // veto no dispara nunca: dos bodegas cualesquiera parecían tener algo en común.
  const r = identify(
    { winery: "Bodega", line: "Broquel", name: "", varietal: "Malbec", region: "", type: "red" },
    deBodega("Trapiche")
  );

  assert.equal(r.level, "ninguna");
});

test("otra uva es otro vino, por más que todo lo demás coincida", () => {
  const soloMalbec = deBodega("Trapiche").filter((w) => w.varietal === "Malbec");
  const r = identify(
    { winery: "Trapiche", line: "Trapiche Broquel", name: "", varietal: "Bonarda", region: "Maipú, Mendoza", type: "red" },
    soloMalbec
  );

  assert.equal(r.level, "ninguna");
});

test("un tinto no se identifica como un blanco", () => {
  const blancos = deBodega("Catena Zapata").filter((w) => w.type === "white");
  const r = identify(
    { winery: "Catena Zapata", line: "Saint Felicien", name: "", varietal: "", region: "", type: "red" },
    blancos
  );

  assert.equal(r.level, "ninguna");
});

test("un vino que no está en el catálogo no se parece a ninguno", () => {
  const r = identify(
    { winery: "Bodega Los Cardones", line: "Refugio Alto", name: "", varietal: "Bonarda", region: "", type: "red" },
    delCatalogo(() => true)
  );

  assert.equal(r.level, "ninguna");
});

// ── Lo que SÍ tiene que resolverse solo ─────────────────────────────────────

test("la lectura buena se identifica sola y sin preguntar", () => {
  const r = identify(
    {
      winery: "Catena Zapata",
      line: "Saint Felicien",
      name: "",
      varietal: "Malbec",
      region: "Luján de Cuyo, Mendoza",
      type: "red",
    },
    deBodega("Catena Zapata")
  );

  assert.equal(r.level, "alta");
  assert.equal(nombreDe(r), "Saint Felicien");
});

test("un nombre al que le falta una letra igual se identifica", () => {
  // El error típico del lector: una letra que se pierde entre el relieve de la
  // etiqueta y el modelo.
  const r = identify(
    { winery: "Catena Zapata", line: "Angelica Zapata", name: "", varietal: "Malbec", region: "", type: "red" },
    deBodega("Catena Zapata")
  );

  assert.equal(r.level, "alta");
  assert.equal(nombreDe(r), "Angélica Zapata");
});

test("un blend sin uva legible se identifica por el resto de la etiqueta", () => {
  const r = identify(
    { winery: "Trapiche", line: "Iscay", name: "", varietal: "", region: "Maipú, Mendoza", type: "red" },
    deBodega("Trapiche")
  );

  assert.equal(r.level, "alta");
  assert.equal(nombreDe(r), "Trapiche Iscay");
});

test("la región desempata dos vinos de la misma bodega y la misma uva", () => {
  // Sin nombre leído, lo único que separa al Aluvional (Gualtallary) del resto
  // de los Malbec de Zuccardi es la zona. Antes la región no participaba de la
  // decisión y el desempate se hacía a ciegas.
  const malbecs = deBodega("Familia Zuccardi").filter((w) => w.varietal === "Malbec");
  const r = identify(
    { winery: "Familia Zuccardi", line: "", name: "", varietal: "Malbec", region: "Gualtallary, Mendoza", type: "red" },
    malbecs
  );

  assert.equal(nombreDe(r), "Zuccardi Aluvional");
});

test("una región más gruesa que la del catálogo no penaliza", () => {
  // La etiqueta dice "Mendoza" y el catálogo "Luján de Cuyo, Mendoza": es la
  // misma zona dicha más corta, no un desacuerdo.
  const r = identify(
    { winery: "Catena Zapata", line: "Saint Felicien", name: "", varietal: "Malbec", region: "Mendoza", type: "red" },
    deBodega("Catena Zapata")
  );

  assert.equal(r.level, "alta");
  assert.equal(nombreDe(r), "Saint Felicien");
});

test("las añadas no dividen: el catálogo describe vinos, no botellas", () => {
  const base = { winery: "Trapiche", line: "Trapiche Broquel", name: "", varietal: "Malbec", region: "", type: "red" };
  const a = identify({ ...base, vintage: "2019" }, deBodega("Trapiche"));
  const b = identify({ ...base, vintage: "2024" }, deBodega("Trapiche"));

  assert.equal(nombreDe(a), nombreDe(b));
  assert.equal(a.level, b.level);
});

// ── Lo que hay que preguntar ────────────────────────────────────────────────

test("bodega bien leída y línea mal leída: se propone, no se impone", () => {
  const r = identify(
    { winery: "Familia Zuccardi", line: "Serie Q", name: "", varietal: "Malbec", region: "Valle de Uco, Mendoza", type: "red" },
    deBodega("Familia Zuccardi")
  );

  assert.equal(r.level, "media", "hay candidato, pero el nombre leído dice otra cosa");
  assert.ok(r.best, "y se ofrece, para que sea un toque y no un formulario");
});

test("dos vinos empatados nunca se resuelven solos", () => {
  // Sin nombre leído, todos los Malbec de Valle de Uco de esa bodega coinciden
  // en todo lo que se leyó. Desde afuera son la misma lectura, y ahí es donde
  // equivocarse es más fácil: se muestra el mejor y se pregunta.
  const r = identify(
    { winery: "Familia Zuccardi", line: "", name: "", varietal: "Malbec", region: "Valle de Uco, Mendoza", type: "red" },
    deBodega("Familia Zuccardi")
  );

  assert.notEqual(r.level, "alta");
  if (r.level === "media") assert.ok(r.alternative, "la segunda opción viaja para poder corregir de un toque");
});

test("una línea leída a medias sí se resuelve, si es la única que se le parece", () => {
  // El contrapeso del test de arriba: ser conservador no puede volverse
  // preguntar siempre. "Serie" es media palabra de "Zuccardi Serie A", y es el
  // único Malbec de esa bodega que la contiene.
  const r = identify(
    { winery: "Familia Zuccardi", line: "Serie", name: "", varietal: "Malbec", region: "Valle de Uco, Mendoza", type: "red" },
    deBodega("Familia Zuccardi")
  );

  assert.equal(r.level, "alta");
  assert.equal(nombreDe(r), "Zuccardi Serie A");
});

// ── Las piezas, por separado ────────────────────────────────────────────────

test("las categorías se reconocen como lo que son", () => {
  assert.equal(esGenerico("Reserva"), true);
  assert.equal(esGenerico("GRAN RESERVA"), true);
  assert.equal(esGenerico("Malbec"), true, "la uva tampoco nombra un vino");
  assert.equal(esGenerico("Angélica Zapata"), false);
  assert.equal(esGenerico("Pispi"), false);
});

test("el puntaje exige evidencia: dos campos coincidiendo no son una certeza", () => {
  const p = scoreCandidate(
    { winery: "", line: "", name: "", varietal: "Malbec", region: "", type: "red" },
    { winery: "Trapiche", line: "Trapiche Broquel", varietal: "Malbec", region: "Maipú, Mendoza", type: "red", source: "catalogo-ar" }
  );

  assert.ok(p, "puntúa, porque nada se contradice");
  assert.ok(p.score < 0.62, `pero no alcanza para identificar (${p.score})`);
});

test("de dos fuentes que dicen lo mismo, gana la más respaldada", () => {
  const lectura = { winery: "Catena Zapata", line: "Saint Felicien", name: "", varietal: "Malbec", region: "", type: "red" };
  const fila = { winery: "Catena Zapata", line: "Saint Felicien", varietal: "Malbec", region: "", type: "red" };

  const r = identify(lectura, [
    { ...fila, source: "comunidad" },
    { ...fila, source: "catalogo-ar" },
  ]);

  assert.equal(r.best.wine.source, "catalogo-ar");
});
