const test = require("node:test");
const assert = require("node:assert/strict");
const { leerPaginacion, MAX_PAGINA } = require("../src/utils/paginacion");
const { construirRango } = require("../src/utils/dateRange");
const { rescatarRespuestaParcial } = require("../src/services/sommelier.service");

// ── paginación ──────────────────────────────────────────────────────────────────────────────────

test("paginación: page=1e9, limit=0, '2.7', Infinity y NaN numéricos", () => {
  assert.equal(leerPaginacion({ page: 1e9 }).page, MAX_PAGINA);
  assert.equal(leerPaginacion({ page: 1e9, limit: 100 }).skip, (MAX_PAGINA - 1) * 100, "el skip tiene techo");
  assert.equal(leerPaginacion({ limit: 0 }).limit, 20, "limit=0 cae al valor por defecto, no a 0");
  assert.equal(leerPaginacion({ limit: "2.7" }).limit, 2);
  assert.equal(leerPaginacion({ page: "2.7" }).page, 2);
  for (const raro of [Infinity, -Infinity, Number.NaN]) {
    const r = leerPaginacion({ page: raro, limit: raro });
    assert.deepEqual(r, { page: 1, limit: 20, skip: 0 }, String(raro));
  }
  assert.equal(leerPaginacion({ limit: "99999" }, { maximo: 50 }).limit, 50);
});

// ── rango de fechas ─────────────────────────────────────────────────────────────────────────────

test("construirRango: days=Infinity o enorme con un `to` válido no revienta (antes: Invalid Date, 500)", () => {
  for (const days of [Infinity, 1e15, Number.MAX_VALUE]) {
    for (const extra of [{ to: "2026-11-01" }, { from: "2026-11-01" }, {}]) {
      const r = construirRango({ days, ...extra, maxDias: 730 });
      assert.ok(r.length >= 1 && r.length <= 730, `${days} ${JSON.stringify(extra)}`);
      assert.ok(r.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
    }
  }
  assert.equal(construirRango({ days: Infinity, to: "2026-11-01", maxDias: 100 }).length, 100);
  assert.equal(construirRango({ days: 0.4, to: "2026-11-01" }).length, 1);
});

// ── Sommelier: rescate de una respuesta cortada ─────────────────────────────────────────────────

const corte = (acumulado) => Object.assign(new Error("corte"), { parcial: true, acumulado });
const RELLENO = " Es un vino fresco y de poca madera que acompaña bien.";

test("rescate: los escapes del JSON se decodifican (\\\" \\n \\u00e9)", () => {
  const json = '{"answer":"Decile \\"hola\\" al mozo.\\nProbá un caf\\u00e9 despu\\u00e9s del asado de domingo con amigos."}';
  const r = rescatarRespuestaParcial(corte(json));
  assert.equal(r.answer, 'Decile "hola" al mozo.\nProbá un café después del asado de domingo con amigos.');
});

test("rescate: los picks del corte NO se rescatan (sólo el texto), y la marca de parcial va", () => {
  const json = '{"answer":"Un Malbec joven acompaña perfecto un asado con chimichurri.","picks":["Catena Alta Malbec","Nieto Senetiner"],"followups":["¿Y de postre?"]}';
  const r = rescatarRespuestaParcial(corte(json));
  assert.deepEqual(r.picks, []);
  assert.deepEqual(r.followups, []);
  assert.equal(r.parcial, true);
  assert.equal(r.offTopic, false);
});

test("rescate: una sola oración sin punto cortada a la mitad no se rescata (va el respaldo)", () => {
  const json = '{"answer":"Para un asado conviene un Malbec joven de Mendoza con buena fruta y poca madera, algo que';
  assert.equal(rescatarRespuestaParcial(corte(json)), null);
});

test("rescate: si el answer cerró aunque no tenga punto final, se usa entero", () => {
  const json = '{"answer":"Para un asado conviene un Malbec joven de Mendoza con buena fruta y poca madera","pi';
  assert.equal(rescatarRespuestaParcial(corte(json)).answer, "Para un asado conviene un Malbec joven de Mendoza con buena fruta y poca madera");
});

test("rescate: sin la clave answer (el modelo empezó por otro campo) no se rescata", () => {
  assert.equal(rescatarRespuestaParcial(corte('{"picks":["Catena Alta Malbec con un nombre bastante largo para pasar el mínimo"],"foll')), null);
  assert.equal(rescatarRespuestaParcial(corte('{"offTopic":false,"recipeFor":"' + "x".repeat(80))), null);
});

test("rescate: el HTML del modelo es DATO, se devuelve como texto literal (el cliente lo pinta como texto)", () => {
  const html = '<img src=x onerror=alert(1)> Un Malbec va bien con el asado de domingo.' + RELLENO;
  const r = rescatarRespuestaParcial(corte('{"answer":"' + html + '"}'));
  assert.equal(typeof r.answer, "string");
  assert.equal(r.answer, html.trim());
});

test("rescate: un escape cortado a la mitad al final no deja una barra suelta", () => {
  const r = rescatarRespuestaParcial(corte('{"answer":"Un Bonarda fresco con pasta. Otro con carne asada y papas rústicas.\\'));
  assert.ok(!r.answer.endsWith("\\"));
});
