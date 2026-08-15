const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTasteProfile,
  rankFeatured,
  puntajeDeAfinidad,
  puntajeDeDescubrimiento,
} = require("../src/services/recommendations.service");

/**
 * Lo que estos tests fijan es la promesa de la home: que lo que muestra tenga
 * que ver con vos.
 *
 * Antes no la cumplía. `getFeatured` barajaba el catálogo con la fecha como
 * semilla y cortaba ocho: la misma home para todo el mundo. El copy sí hablaba
 * de tu bodega ("Porque ya tenés 3 Malbec"), pero se escribía DESPUÉS de elegir
 * al azar, así que explicaba una casualidad cuando la había.
 */

const vino = (winery, name, varietal, region, type = "red") => ({
  winery,
  name,
  varietal,
  region,
  type,
});

const CATALOGO = [
  vino("Catena", "Catena Alta", "Malbec", "Mendoza"),
  vino("Norton", "Reserva", "Malbec", "Mendoza"),
  vino("Trapiche", "Medalla", "Malbec", "Mendoza"),
  vino("Rutini", "Colección", "Cabernet Sauvignon", "Mendoza"),
  vino("Salentein", "Numina", "Cabernet Franc", "Valle de Uco"),
  vino("Colomé", "Estate", "Torrontés", "Salta", "white"),
  vino("Zuccardi", "Serie A", "Bonarda", "Mendoza"),
  vino("Chandon", "Extra Brut", "Chardonnay", "Mendoza", "sparkling"),
];

test("el perfil sale de lo que comprás y de lo que dijiste que te gusta", () => {
  const perfil = buildTasteProfile({
    wines: [
      { winery: "Catena", name: "Catena Alta", varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 },
      { winery: "Norton", name: "Reserva", varietal: "Malbec", region: "Mendoza", type: "red", rating: 3 },
      { winery: "Colomé", name: "Estate", varietal: "Torrontés", region: "Salta", type: "white", rating: 0 },
    ],
    preferences: { favoriteVarietals: ["Cabernet Sauvignon"], favoriteTypes: ["red"] },
  });

  assert.equal(perfil.varietals.get("malbec"), 2);
  assert.equal(perfil.regions.get("mendoza"), 2);
  assert.ok(perfil.puntuadosAlto.has("malbec"), "un 5 dice que esa uva te gustó");
  assert.ok(!perfil.puntuadosAlto.has("torrontés"), "sin puntuar no es lo mismo que puntuado bajo");
  assert.ok(perfil.elegidos.varietals.has("cabernet sauvignon"));
  assert.ok(perfil.tieneHistorial);
});

test("un vino que ya tenés en la bodega NUNCA se recomienda", () => {
  // Era el peor resultado posible: la home descubriéndote una botella que está
  // en tu cocina. El barajado no tenía forma de evitarlo.
  const perfil = buildTasteProfile({
    wines: [{ winery: "Catena", name: "Catena Alta", varietal: "Malbec", region: "Mendoza", type: "red" }],
  });

  const elegidos = rankFeatured(CATALOGO, perfil, { count: 8, seed: 1 });
  assert.ok(
    !elegidos.some((w) => w.winery === "Catena" && w.name === "Catena Alta"),
    "el vino que ya está en la bodega no puede aparecer entre las recomendaciones"
  );
});

test("la afinidad premia la uva que tomás por encima de la región y el color", () => {
  const perfil = buildTasteProfile({
    wines: [{ winery: "X", name: "Y", varietal: "Malbec", region: "Mendoza", type: "red" }],
  });

  const mismaUva = puntajeDeAfinidad(vino("A", "B", "Malbec", "Salta"), perfil);
  const mismaRegion = puntajeDeAfinidad(vino("A", "B", "Tannat", "Mendoza"), perfil);
  assert.ok(mismaUva > mismaRegion, "la uva describe un gusto mejor que la zona");

  const nadaEnComun = puntajeDeAfinidad(vino("A", "B", "Tannat", "Salta", "white"), perfil);
  assert.equal(nadaEnComun, 0);
});

test("el descubrimiento premia lo nuevo por un lado conocido, no lo nuevo a secas", () => {
  const perfil = buildTasteProfile({
    wines: [{ winery: "X", name: "Y", varietal: "Malbec", region: "Mendoza", type: "red" }],
  });

  // Uva nueva pero del color que tomás: es la recomendación que se puede contar
  // ("si te gustó ese Malbec, probá este Cabernet").
  const puente = puntajeDeDescubrimiento(vino("A", "B", "Cabernet Sauvignon", "Mendoza", "red"), perfil);
  // Uva nueva y color que no tomás: novedad sin ninguna razón detrás.
  const salto = puntajeDeDescubrimiento(vino("A", "B", "Torrontés", "Salta", "white"), perfil);
  assert.ok(puente > salto, "lo nuevo tiene que entrar por algún lado conocido");

  // La uva que ya tomás no es un descubrimiento salvo que venga de otra zona.
  assert.equal(puntajeDeDescubrimiento(vino("A", "B", "Malbec", "Mendoza"), perfil), 0);
  assert.ok(puntajeDeDescubrimiento(vino("A", "B", "Malbec", "Salta"), perfil) > 0);
});

test("la home no se llena de la uva que más tomás", () => {
  // El pedido explícito: si te gustan los Malbec, no mostrar siempre Malbec.
  const perfil = buildTasteProfile({
    wines: [
      { winery: "X", name: "1", varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 },
      { winery: "Y", name: "2", varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 },
      { winery: "Z", name: "3", varietal: "Malbec", region: "Mendoza", type: "red", rating: 4 },
    ],
    preferences: { favoriteVarietals: ["Malbec"], favoriteTypes: ["red"] },
  });

  const elegidos = rankFeatured(CATALOGO, perfil, { count: 6, seed: 7 });
  const malbecs = elegidos.filter((w) => w.varietal === "Malbec").length;
  assert.ok(malbecs <= 2, `la home no puede ser todo Malbec (fueron ${malbecs})`);
  assert.ok(elegidos.length > malbecs, "tiene que haber algo más que la uva de siempre");
});

test("no se repite la bodega ni se repite un vino", () => {
  const perfil = buildTasteProfile({ wines: [] });
  const elegidos = rankFeatured(CATALOGO, perfil, { count: 8, seed: 3 });

  const bodegas = new Set(elegidos.map((w) => w.winery));
  assert.equal(bodegas.size, elegidos.length, "una bodega no puede aparecer dos veces");

  const ids = new Set(elegidos.map((w) => `${w.winery}|${w.name}`));
  assert.equal(ids.size, elegidos.length, "un vino no puede aparecer dos veces");
});

test("la primera tarjeta es la de mayor afinidad: es la que decide si seguís mirando", () => {
  const perfil = buildTasteProfile({
    wines: [
      { winery: "X", name: "1", varietal: "Cabernet Sauvignon", region: "Mendoza", type: "red", rating: 5 },
    ],
  });

  const [primera] = rankFeatured(CATALOGO, perfil, { count: 4, seed: 11 });
  assert.equal(primera.varietal, "Cabernet Sauvignon");
});

test("el set mezcla afinidad con descubrimiento en vez de ser todo lo mismo", () => {
  const perfil = buildTasteProfile({
    wines: [
      { winery: "X", name: "1", varietal: "Malbec", region: "Mendoza", type: "red", rating: 5 },
      { winery: "Y", name: "2", varietal: "Malbec", region: "Mendoza", type: "red", rating: 4 },
    ],
  });

  const elegidos = rankFeatured(CATALOGO, perfil, { count: 6, seed: 5 });
  const uvas = new Set(elegidos.map((w) => w.varietal));
  assert.ok(uvas.size >= 3, `un set de 6 con menos de 3 uvas no descubre nada (fueron ${uvas.size})`);

  const conocidas = elegidos.filter((w) => w.varietal === "Malbec").length;
  assert.ok(conocidas >= 1, "tampoco puede ser todo desconocido: tenés que reconocerte en algo");
});

test("sin bodega ni preferencias devuelve un set completo igual", () => {
  // Alguien que recién se registra: no hay nada que puntúe, pero la home no
  // puede quedar vacía.
  const perfil = buildTasteProfile({});
  const elegidos = rankFeatured(CATALOGO, perfil, { count: 8, seed: 2 });

  assert.ok(elegidos.length > 0, "una home vacía es peor que una genérica");
  assert.ok(!perfil.tieneHistorial, "dos botellas no son una tendencia, y cero menos");
});

test("dentro del día el set es estable, y con otra semilla cambia", () => {
  const perfil = buildTasteProfile({ wines: [] });
  const hoy = rankFeatured(CATALOGO, perfil, { count: 5, seed: 100 });
  const otraVezHoy = rankFeatured(CATALOGO, perfil, { count: 5, seed: 100 });
  const manana = rankFeatured(CATALOGO, perfil, { count: 5, seed: 101 });

  assert.deepEqual(hoy, otraVezHoy, "dos visitas el mismo día no pueden contradecirse");
  assert.notDeepEqual(hoy, manana, "y al día siguiente tiene que rotar");
});

test("un catálogo vacío o inválido no rompe la home", () => {
  const perfil = buildTasteProfile({ wines: [] });
  assert.deepEqual(rankFeatured([], perfil, { count: 8, seed: 1 }), []);
  assert.deepEqual(rankFeatured(null, perfil, { count: 8, seed: 1 }), []);
});
