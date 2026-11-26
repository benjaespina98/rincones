const test = require("node:test");
const assert = require("node:assert/strict");

const { recortarHistorial, armarPrompt, vinosDeLaCharla } = require("../src/services/sommelier.service");
const { respuestaDeRespaldo } = require("../src/services/sommelierRespaldo");

// El caso real: se mostró la tarjeta de un vino y después «¿cómo me recomendás tomarlo?».
const charla = [
  { role: "user", text: "¿Cuál abro hoy?" },
  { role: "assistant", text: "Abrí algo que ya tengas.", wines: [{ name: "Serie A", winery: "Zuccardi", varietal: "Malbec", type: "red", _id: "x", image: "data:..." }] },
];

test("el historial conserva los vinos de las tarjetas, sólo con datos cortos", () => {
  const h = recortarHistorial(charla);
  assert.deepEqual(h[1].wines, [{ name: "Serie A", winery: "Zuccardi", varietal: "Malbec", type: "red" }]);
  assert.equal(h[0].wines, undefined);
});

test("los vinos del cliente se sanean y se acotan; los turnos de la persona no los llevan", () => {
  const h = recortarHistorial([
    { role: "user", text: "hola", wines: [{ name: "Colado" }] },
    { role: "assistant", text: "ok", wines: [{ name: "A" }, { name: 5 }, null, { name: "B" }, { name: "C" }, { name: "D" }] },
    { role: "assistant", text: "otra", wines: "no es una lista" },
  ]);
  assert.equal(h[0].wines, undefined);
  assert.deepEqual(h[1].wines.map((v) => v.name), ["A", "B", "C"]);
  assert.equal(h[2].wines, undefined);
});

test("el prompt dice a qué vino se refiere «lo»", () => {
  const prompt = armarPrompt({ question: "¿cómo me recomendás tomarlo?", history: recortarHistorial(charla) });
  assert.match(prompt, /VINOS QUE LE MOSTRASTE/);
  assert.match(prompt, /Serie A · Zuccardi · Malbec/);
});

test("sin tarjetas no se agrega la sección", () => {
  const prompt = armarPrompt({ question: "¿y con pescado?", history: [{ role: "assistant", text: "Un Malbec." }] });
  assert.doesNotMatch(prompt, /VINOS QUE LE MOSTRASTE/);
});

test("si el modelo falla, a una pregunta de servicio se contesta sobre el vino de la charla", () => {
  const contexto = vinosDeLaCharla(recortarHistorial(charla));
  const r = respuestaDeRespaldo({ question: "Como me recomendar tomarlo, temperatura, aireado", contexto });
  assert.match(r.answer, /Serie A/);
  assert.match(r.answer, /16-18 °C/);
});

test("un blanco o un espumante se sirven fríos", () => {
  const blanco = respuestaDeRespaldo({ question: "¿a qué temperatura?", contexto: [{ name: "Torrontés X", type: "white" }] });
  assert.match(blanco.answer, /8-10 °C/);
  const burbujas = respuestaDeRespaldo({ question: "¿cómo lo sirvo?", contexto: [{ name: "Brut", type: "sparkling" }] });
  assert.match(burbujas.answer, /6-8 °C/);
});

const SERIE_A = { name: "Serie A", varietal: "Malbec", type: "red" };

test("palabras parecidas u otro vino no son una pregunta de servicio sobre éste", () => {
  for (const question of [
    "¿Qué me servís con asado?",
    "¿Qué puedo servir con pescado?",
    "¿Qué vino me sirve para regalar?",
    "¿tenés alguna reserva?",
    "¿cómo lo conservo?",
    "uno de Buenos Aires",
    "¿Qué copas conviene comprar?",
    "¿a qué temperatura va un Torrontés?",
  ]) {
    assert.doesNotMatch(respuestaDeRespaldo({ question, contexto: [SERIE_A] }).answer, /Serie A servilo/, question);
  }
});

test("las formas usuales de preguntar por el servicio se reconocen", () => {
  for (const question of ["¿cómo debo tomarlo?", "¿cómo se toma?", "¿lo enfrío?", "¿lo dejo respirar?", "¿lo decanto?", "¿cómo lo sirvo?"]) {
    assert.match(respuestaDeRespaldo({ question, contexto: [SERIE_A] }).answer, /Serie A servilo/, question);
  }
});

test("el tipo guardado le gana a la uva y sin pistas no se afirma una temperatura", () => {
  const pregunta = (vino) => respuestaDeRespaldo({ question: "¿a qué temperatura?", contexto: [vino] }).answer;
  assert.match(pregunta({ name: "B", type: "sparkling", varietal: "Chardonnay" }), /6-8 °C/);
  assert.match(pregunta({ name: "O", type: "fortified" }), /12-14 °C/);
  assert.match(pregunta({ name: "R", type: "unknown", varietal: "Riesling" }), /8-10 °C/);
  assert.doesNotMatch(pregunta({ name: "Misterio", type: "unknown" }), /Misterio/);
});

test("una pregunta que no es de servicio, o sin vino de contexto, sigue el respaldo de siempre", () => {
  const r = respuestaDeRespaldo({ question: "¿qué va con asado?", contexto: [{ name: "Serie A" }] });
  assert.doesNotMatch(r.answer, /Serie A/);
  assert.doesNotMatch(respuestaDeRespaldo({ question: "¿a qué temperatura?" }).answer, /16-18/);
});
