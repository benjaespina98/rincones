const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const winesService = require("../src/services/wines.service");

/**
 * El bug que estos tests fijan: la home decía "Ya no te queda nada en stock"
 * teniendo botellas.
 *
 * `getUserStats` contaba el stock por `status === "stock"`, y `toWineStatus`
 * manda a "tasted" a cualquier vino con botellas que ya hayas probado. Con eso,
 * todo lo que abriste alguna vez y todavía tenés desaparecía de la cuenta: si
 * era tu único vino, la cuenta daba cero.
 *
 * Se prueba sobre el pipeline y no sobre la base porque el error vivía en la
 * expresión, no en los datos: cualquier bodega la disparaba.
 */
const capturarFacet = async () => {
  const original = Wine.aggregate;
  let pipeline = null;
  Wine.aggregate = function aggregate(p) {
    pipeline = p;
    return { exec: async () => [] };
  };
  try {
    await Wine.getUserStats("507f1f77bcf86cd799439011");
  } finally {
    Wine.aggregate = original;
  }
  const etapaFacet = pipeline.find((etapa) => etapa.$facet);
  return etapaFacet.$facet;
};

test("el stock se cuenta por botellas, nunca por status", async () => {
  const facet = await capturarFacet();
  const totales = facet.totals[0].$group;

  assert.deepEqual(
    totales.stock,
    { $sum: { $cond: [{ $gt: ["$quantity", 0] }, 1, 0] } },
    "el stock tiene que salir de quantity: un vino probado con botellas sigue siendo stock"
  );

  const serializado = JSON.stringify(totales.stock);
  assert.ok(
    !serializado.includes("$status"),
    "contar el stock por status esconde todo lo que probaste y todavía tenés"
  );
});

test("las estadísticas distinguen vinos con stock de botellas totales", async () => {
  const facet = await capturarFacet();
  const totales = facet.totals[0].$group;

  assert.deepEqual(
    totales.bottles,
    { $sum: { $ifNull: ["$quantity", 0] } },
    "`bottles` suma botellas; `stock` cuenta vinos. Los textos necesitan los dos"
  );
});

/**
 * `getStatsSummary` es el otro lugar donde se contaban los vinos, y tenía los
 * dos problemas juntos: bajaba la colección ENTERA (documentos completos, sin
 * `lean`) para contar cinco números, y promediaba dividiendo por todos los
 * vinos, así que cada vino sin puntuar entraba como un cero.
 */
const conAgregacion = async (fila, fn) => {
  const original = Wine.aggregate;
  let pipeline = null;
  Wine.aggregate = function aggregate(p) {
    pipeline = p;
    return { exec: async () => (fila ? [fila] : []) };
  };
  try {
    return await fn(() => pipeline);
  } finally {
    Wine.aggregate = original;
  }
};

test("el resumen de la bodega lo cuenta Mongo, no Node", async () => {
  const original = Wine.find;
  let usoFind = false;
  Wine.find = function find() {
    usoFind = true;
    return { exec: async () => [] };
  };
  try {
    await conAgregacion(null, async () => winesService.getStatsSummary("507f1f77bcf86cd799439011"));
  } finally {
    Wine.find = original;
  }
  assert.equal(
    usoFind,
    false,
    "traer la colección completa para contar cinco números es la consulta más cara de la app"
  );
});

test("el promedio ignora los vinos sin puntuar", async () => {
  // 62 vinos, 20 puntuados: promediando por los 62 daba 1.0, un número que no
  // describe a nadie. Es el mismo error que ya se había corregido en getUserStats.
  const stats = await conAgregacion(
    { totalWines: 62, tastedWines: 30, favoriteWines: 4, stockWines: 40, sumaPuntajes: 80, puntuados: 20 },
    async () => winesService.getStatsSummary("507f1f77bcf86cd799439011")
  );

  assert.equal(stats.averageRating, 4, "80 puntos entre 20 vinos puntuados son 4, no 1.3");
  assert.equal(stats.totalWines, 62);
  assert.equal(stats.stockWines, 40);
});

test("una bodega vacía devuelve la misma forma, en cero", async () => {
  const stats = await conAgregacion(null, async () =>
    winesService.getStatsSummary("507f1f77bcf86cd799439011")
  );

  assert.equal(stats.totalWines, 0);
  assert.equal(stats.averageRating, 0, "sin puntuados no se divide por cero");
  assert.deepEqual(stats.byRating, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
});

test("sin vinos, los totales vienen en cero y completos", async () => {
  const original = Wine.aggregate;
  Wine.aggregate = () => ({ exec: async () => [] });
  try {
    const stats = await Wine.getUserStats("507f1f77bcf86cd799439011");
    // Quien los lee no tiene que preguntar si existen: si faltara `bottles`,
    // el cliente no podría distinguir "no vino el dato" de "no hay botellas".
    assert.deepEqual(stats.totals, { total: 0, stock: 0, bottles: 0, consumed: 0 });
  } finally {
    Wine.aggregate = original;
  }
});
