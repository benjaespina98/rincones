const test = require("node:test");
const assert = require("node:assert/strict");

const { rescatarRespuestaParcial } = require("../src/services/sommelier.service");

const corte = (acumulado) => Object.assign(new Error("cortó la respuesta (MAX_TOKENS)"), { parcial: true, acumulado });

test("un corte con el campo answer cerrado conserva la respuesta entera", () => {
  const json = '{"answer":"Con pasta con tomate te va bien un Bonarda joven: fresco y de poca madera.","picks":["Catena Bon';
  const r = rescatarRespuestaParcial(corte(json));
  assert.equal(r.answer, "Con pasta con tomate te va bien un Bonarda joven: fresco y de poca madera.");
  assert.deepEqual(r.picks, []);
  // Marcada como parcial: el controlador no la cachea ni reemplaza una respuesta anterior.
  assert.equal(r.parcial, true);
});

test("un corte a mitad del answer se recorta a la última oración completa", () => {
  const json = '{"answer":"Para un asado, un Malbec de Mendoza es lo clásico. Si querés algo más liviano, probá un Pinot Noi';
  const r = rescatarRespuestaParcial(corte(json));
  assert.equal(r.answer, "Para un asado, un Malbec de Mendoza es lo clásico.");
});

test("con muy poco texto no se rescata: queda el respaldo", () => {
  assert.equal(rescatarRespuestaParcial(corte('{"answer":"Un Mal')), null);
  assert.equal(rescatarRespuestaParcial(corte("")), null);
});

test("un error sin texto acumulado o que no es parcial no se rescata", () => {
  assert.equal(rescatarRespuestaParcial(new Error("timeout")), null);
  assert.equal(rescatarRespuestaParcial(Object.assign(new Error("x"), { parcial: false, acumulado: '{"answer":"' + "a".repeat(80) + '"}' })), null);
  assert.equal(rescatarRespuestaParcial(null), null);
});
