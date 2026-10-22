const test = require("node:test");
const assert = require("node:assert/strict");
const { respuestaDeRespaldo, fueraDeTemaPara, FUERA_DE_TEMA_FRASES } = require("../src/services/sommelierRespaldo");
const sommelierRoutes = require("../src/routes/sommelier.routes");

/**
 * El Sommelier nunca se queda sin algo para decir: si el modelo falla, contesta con lo que se puede sin él.
 */
const BODEGA = [
  { name: "Trumpeter Malbec", quantity: 2, rating: 4 },
  { name: "Nicasia", quantity: 1, rating: 5 },
  { name: "Sin stock", quantity: 0, rating: 5 },
];

test("con vinos en stock recomienda los mejor puntuados de ESOS, y los devuelve como picks", () => {
  const r = respuestaDeRespaldo({ question: "¿qué abro hoy?", wines: BODEGA });
  assert.deepEqual(r.picks, ["Nicasia", "Trumpeter Malbec"]);
  assert.ok(r.answer.includes("Nicasia"));
  assert.ok(!r.answer.includes("Sin stock"), "lo que no tiene en casa no se recomienda");
  assert.ok(r.followups.length > 0);
});

test("sin bodega sugiere una uva según lo que preguntó, o un Malbec si no se reconoce nada", () => {
  assert.match(respuestaDeRespaldo({ question: "algo para el asado del domingo" }).answer, /Malbec o un Cabernet/);
  assert.match(respuestaDeRespaldo({ question: "con ceviche de pescado" }).answer, /Sauvignon Blanc/);
  assert.match(respuestaDeRespaldo({ question: "no sé qué quiero" }).answer, /Malbec de Mendoza/);
  assert.deepEqual(respuestaDeRespaldo({ question: "asado" }).picks, []);
});

test("siempre devuelve texto, aunque no le pasen nada", () => {
  const r = respuestaDeRespaldo();
  assert.ok(r.answer.length > 20);
  assert.ok(Array.isArray(r.followups));
});

test("la misma pregunta recibe la misma respuesta, y preguntas distintas no suenan todas igual", () => {
  const una = respuestaDeRespaldo({ question: "pregunta uno", wines: BODEGA });
  assert.equal(respuestaDeRespaldo({ question: "pregunta uno", wines: BODEGA }).answer, una.answer);
  const formas = new Set(Array.from({ length: 20 }, (_, i) => respuestaDeRespaldo({ question: `consulta ${i}` }).answer.split(":")[0]));
  assert.ok(formas.size >= 2);
});

test("fuera de tema: amable, con por dónde seguir y no siempre la misma frase", () => {
  const frases = new Set();
  for (const q of ["generame un prompt", "quién ganó el mundial", "escribime un poema", "cuánto es 2+2", "cómo está el dólar"]) {
    const r = fueraDeTemaPara(q);
    assert.equal(r.offTopic, true);
    assert.ok(FUERA_DE_TEMA_FRASES.includes(r.answer));
    assert.ok(r.followups.length > 0);
    frases.add(r.answer);
  }
  assert.ok(frases.size >= 2);
});

test("el Sommelier ya no acepta fotos: la ruta contesta 410 sin leer nada", async () => {
  const capa = sommelierRoutes.stack.find((l) => l.route?.path === "/photo" && l.route.methods.post);
  assert.ok(capa, "la ruta sigue existiendo para contestar claro a una app vieja");
  const handlers = capa.route.stack.map((l) => l.handle);
  assert.equal(handlers.length, 2, "sólo autenticación y el aviso: sin límites de IA ni subida de archivos");
  let status;
  let cuerpo;
  const res = { status: (s) => ((status = s), res), json: (c) => ((cuerpo = c), res) };
  handlers[1]({}, res);
  assert.equal(status, 410);
  assert.match(cuerpo.message, /ya no mira fotos/);
});
