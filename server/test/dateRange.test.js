const test = require("node:test");
const assert = require("node:assert/strict");
const { construirRango, diaDe, esDiaValido, diasEntre } = require("../src/utils/dateRange");

/**
 * El rango de un informe.
 *
 * ── POR QUÉ TIENE SUS PROPIOS TESTS ─────────────────────────────────────────
 * Porque lo usan tres pantallas que tienen que coincidir —las métricas de uso, el
 * informe de campaña del panel y el que abre el anunciante con su enlace— y
 * porque un rango mal armado no falla: devuelve números, sólo que de otros días.
 * En un informe que se factura, eso es lo peor que puede pasar.
 */

const hoy = diaDe();

test("por defecto son los últimos N días, terminando hoy", () => {
  const r = construirRango({ days: 7 });
  assert.equal(r.length, 7);
  assert.equal(r[r.length - 1], hoy, "el último día es hoy");
  assert.equal(diasEntre(r[0], r[r.length - 1]), 7);
});

test("un período elegido a mano incluye los dos extremos", () => {
  // Es el caso que motivó todo: facturar marzo. "Últimos 30 días" el 5 de abril
  // ya no incluye el 1 de marzo, y encima mete cinco días que no se cobran.
  const r = construirRango({ from: "2026-03-01", to: "2026-03-31" });
  assert.equal(r.length, 31);
  assert.equal(r[0], "2026-03-01");
  assert.equal(r[30], "2026-03-31");
});

test("las fechas al revés se ordenan solas", () => {
  // Elegir primero el "hasta" en un calendario es de lo más normal.
  const r = construirRango({ from: "2026-03-31", to: "2026-03-01" });
  assert.equal(r[0], "2026-03-01");
  assert.equal(r[r.length - 1], "2026-03-31");
});

test("no se puede pedir el futuro", () => {
  // Un informe con días que todavía no pasaron muestra ceros al final, y eso se
  // lee como una caída de tráfico que no existe.
  const r = construirRango({ from: hoy, to: "2099-12-31" });
  assert.equal(r[r.length - 1], hoy);
  assert.equal(r.length, 1);
});

test("con una sola punta, la otra se completa sola", () => {
  const desdeSolo = construirRango({ from: "2026-01-01" });
  assert.equal(desdeSolo[0], "2026-01-01");
  assert.equal(desdeSolo[desdeSolo.length - 1], hoy, "hasta hoy");

  const hastaSolo = construirRango({ to: "2026-03-31", days: 10 });
  assert.equal(hastaSolo.length, 10);
  assert.equal(hastaSolo[hastaSolo.length - 1], "2026-03-31");
});

test("el techo conserva lo más reciente, no lo más viejo", () => {
  // Si alguien pide diez años, lo que estaba mirando es el final del período.
  // Cortar por el otro lado le devolvería 2016 y le sacaría este mes.
  const r = construirRango({ from: "2016-01-01", to: hoy, maxDias: 30 });
  assert.equal(r.length, 30);
  assert.equal(r[r.length - 1], hoy);
});

test("una fecha inventada se ignora en vez de romper el informe", () => {
  for (const basura of ["2026-13-45", "ayer", "", null, "2026/03/01", "31-03-2026"]) {
    assert.equal(esDiaValido(basura), false, JSON.stringify(basura));
    const r = construirRango({ from: basura, to: basura, days: 5 });
    assert.equal(r.length, 5, "cae a los últimos N días");
    assert.equal(r[r.length - 1], hoy);
  }
});

test("el 29 de febrero de un año bisiesto existe, y el de uno común no", () => {
  assert.equal(esDiaValido("2028-02-29"), true);
  assert.equal(esDiaValido("2027-02-29"), false);
});

test("un rango de un solo día es válido", () => {
  const r = construirRango({ from: "2026-03-15", to: "2026-03-15" });
  assert.deepEqual(r, ["2026-03-15"]);
});

test("cruza fin de mes y fin de año sin saltearse días", () => {
  const r = construirRango({ from: "2025-12-30", to: "2026-01-02" });
  assert.deepEqual(r, ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
});
