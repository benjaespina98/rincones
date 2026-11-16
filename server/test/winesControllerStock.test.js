const test = require("node:test");
const assert = require("node:assert/strict");
const winesService = require("../src/services/wines.service");
const controller = require("../src/controllers/wines.controller");

/** El controlador traduce el conflicto de stock a 409 con el mensaje; un error común sigue siendo 500. */
const crearRes = () => {
  const r = { statusCode: null, cuerpo: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
};

const conServicio = async (rechazo) => {
  const original = winesService.adjustStock;
  const consola = console.error;
  winesService.adjustStock = async () => { throw rechazo; };
  console.error = () => {};
  const res = crearRes();
  try {
    await controller.adjustStock({ user: { id: "u1" }, params: { id: "w1" }, body: {} }, res);
    await new Promise((r) => setImmediate(r));
  } finally {
    winesService.adjustStock = original;
    console.error = consola;
  }
  return res;
};

test("un conflicto de stock responde 409 con su mensaje", async () => {
  const res = await conServicio(Object.assign(new Error("No te quedan botellas para abrir."), { codigo: "CONFLICTO_DE_STOCK" }));
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.cuerpo, { success: false, error: "No te quedan botellas para abrir." });
});

test("un error cualquiera sigue siendo 500 y no filtra su mensaje", async () => {
  const res = await conServicio(new Error("secreto interno"));
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.cuerpo).includes("secreto interno"));
});
