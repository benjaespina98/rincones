const test = require("node:test");
const assert = require("node:assert/strict");
const ChangeLog = require("../src/models/changeLog.model");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const WineReview = require("../src/models/wineReview.model");
const adminController = require("../src/controllers/admin.controller");

/**
 * El resumen del panel.
 *
 * ── QUÉ ESTABA MAL Y POR QUÉ VALE UN TEST ───────────────────────────────────
 * El panel pedía los últimos 60 movimientos y sacaba de ahí sus números:
 * "Eventos 24h" era cuántos de esos 60 eran de hoy, así que se plantaba en 60 y
 * nunca podía decir más aunque hubiera 300. Un número que se congela solo, sin
 * fallar y sin avisar, se sigue mirando como si fuera cierto: es el peor tipo de
 * error que puede tener un tablero.
 *
 * Lo que se fija acá es que cada número sea un conteo sobre la base y que el
 * rango de tiempo sea el que la tarjeta dice.
 */

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test("cada número del resumen es un conteo, no una muestra recortada", async () => {
  const originales = {
    user: User.countDocuments,
    log: ChangeLog.countDocuments,
    wine: Wine.countDocuments,
    review: WineReview.countDocuments,
  };

  const filtros = [];
  User.countDocuments = async (f) => (f?.role === "admin" ? 3 : 1200);
  // Muy por encima de los 60 que traía la muestra: es justo el caso que antes
  // no se podía representar.
  ChangeLog.countDocuments = async (f) => {
    filtros.push(f);
    if (f.action === "create") return 180;
    if (f.action === "update") return 120;
    if (f.action === "delete") return 40;
    return 340;
  };
  Wine.countDocuments = async () => 5400;
  WineReview.countDocuments = async () => 76;

  try {
    const res = responder();
    await adminController.getSummary({ query: {} }, res, (e) => { throw e; });

    const d = res.body.data;
    assert.equal(d.users, 1200);
    assert.equal(d.admins, 3);
    assert.equal(d.wines, 5400);
    assert.equal(d.reviews, 76);
    assert.equal(d.activity.total, 340, "puede pasar de 60, que era el techo invisible");
    assert.equal(d.activity.create + d.activity.update + d.activity.delete, 340);
  } finally {
    User.countDocuments = originales.user;
    ChangeLog.countDocuments = originales.log;
    Wine.countDocuments = originales.wine;
    WineReview.countDocuments = originales.review;
  }
});

test("el resumen dice desde cuándo cuenta, para que la pantalla no invente el período", async () => {
  const originales = {
    user: User.countDocuments,
    log: ChangeLog.countDocuments,
    wine: Wine.countDocuments,
    review: WineReview.countDocuments,
  };
  let filtroUsado = null;
  User.countDocuments = async () => 0;
  ChangeLog.countDocuments = async (f) => { filtroUsado = filtroUsado || f; return 0; };
  Wine.countDocuments = async () => 0;
  WineReview.countDocuments = async () => 0;

  try {
    const res = responder();
    const antes = Date.now();
    await adminController.getSummary({ query: { hours: 24 } }, res, (e) => { throw e; });

    const d = res.body.data;
    assert.equal(d.hours, 24);
    const desde = new Date(d.since).getTime();
    const esperado = antes - 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(desde - esperado) < 5000, "`since` es realmente hace 24 horas");
    // Y es el mismo corte que usó la consulta: si no, la tarjeta diría un
    // período y el número sería de otro.
    assert.ok(Math.abs(filtroUsado.createdAt.$gte.getTime() - desde) < 5, "el filtro usa ese mismo corte");
  } finally {
    User.countDocuments = originales.user;
    ChangeLog.countDocuments = originales.log;
    Wine.countDocuments = originales.wine;
    WineReview.countDocuments = originales.review;
  }
});

test("el rango tiene topes: ni cero horas ni un año", async () => {
  const originales = {
    user: User.countDocuments,
    log: ChangeLog.countDocuments,
    wine: Wine.countDocuments,
    review: WineReview.countDocuments,
  };
  User.countDocuments = async () => 0;
  ChangeLog.countDocuments = async () => 0;
  Wine.countDocuments = async () => 0;
  WineReview.countDocuments = async () => 0;

  try {
    for (const [pedido, esperado] of [[0, 24], [-5, 24], ["abc", 24], [99999, 24 * 30]]) {
      const res = responder();
      await adminController.getSummary({ query: { hours: pedido } }, res, (e) => { throw e; });
      assert.equal(res.body.data.hours, esperado, `hours=${pedido}`);
    }
  } finally {
    User.countDocuments = originales.user;
    ChangeLog.countDocuments = originales.log;
    Wine.countDocuments = originales.wine;
    WineReview.countDocuments = originales.review;
  }
});
