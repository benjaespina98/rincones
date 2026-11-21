const test = require("node:test");
const assert = require("node:assert/strict");
const { limitesDelDia, filtroDeFechas } = require("../src/utils/dateRange");

/**
 * Filtros de fecha de los listados (Actividad y Logs): mismo calendario argentino que las métricas.
 * Antes usaban `new Date("YYYY-MM-DD")` (medianoche UTC) y `setHours` (zona del proceso).
 */

test("un día de calendario argentino empieza a las 03:00 UTC y termina 24 h después menos 1 ms", () => {
  const { inicio, fin } = limitesDelDia("2026-03-05");
  assert.equal(inicio.toISOString(), "2026-03-05T03:00:00.000Z");
  assert.equal(fin.toISOString(), "2026-03-06T02:59:59.999Z");
});

test("filtroDeFechas: `to` incluye el día entero y el corte es el de las métricas, no UTC", () => {
  const f = filtroDeFechas({ from: "2026-03-05", to: "2026-03-05" });
  // Un evento a las 22:00 de Argentina del 5 (01:00 UTC del 6) entra; uno a las 00:30 del 6 no.
  const adentro = new Date("2026-03-06T01:00:00Z");
  const afuera = new Date("2026-03-06T03:30:00Z");
  assert.ok(adentro >= f.$gte && adentro <= f.$lte);
  assert.ok(!(afuera <= f.$lte));
  // Y uno a las 22:00 AR del día anterior queda fuera por abajo.
  assert.ok(!(new Date("2026-03-05T01:00:00Z") >= f.$gte));
});

test("filtroDeFechas: ignora valores inválidos, ordena los dados vuelta y devuelve null si no queda nada", () => {
  assert.equal(filtroDeFechas({}), null);
  assert.equal(filtroDeFechas({ from: "basura", to: "2026-02-30" }), null);
  assert.equal(filtroDeFechas({ from: "2026-13-01" }), null);
  const soloDesde = filtroDeFechas({ from: "2026-03-05", to: "no" });
  assert.ok(soloDesde.$gte && !soloDesde.$lte);
  const vuelta = filtroDeFechas({ from: "2026-03-10", to: "2026-03-01" });
  assert.equal(vuelta.$gte.toISOString(), "2026-03-01T03:00:00.000Z");
  assert.equal(vuelta.$lte.toISOString(), "2026-03-11T02:59:59.999Z");
});
