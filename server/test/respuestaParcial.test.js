const test = require("node:test");
const assert = require("node:assert/strict");
const { extraerRespuestaParcial } = require("../src/utils/respuestaParcial");

/**
 * Sacar el texto de "answer" de un JSON que todavía se está escribiendo.
 *
 * El caso que importa: el JSON llega cortado en CUALQUIER punto, incluso en medio de un
 * escape. Un `JSON.parse` falla hasta el último carácter; esto tiene que dar siempre el
 * prefijo correcto, sin barras sueltas y sin romperse. La prueba más fuerte es la última:
 * cortar un JSON real en cada posición posible.
 */

test("sin la clave todavía, texto vacío", () => {
  assert.deepEqual(extraerRespuestaParcial(""), { texto: "", completa: false });
  assert.deepEqual(extraerRespuestaParcial("{"), { texto: "", completa: false });
  assert.deepEqual(extraerRespuestaParcial('{"ans'), { texto: "", completa: false });
  assert.deepEqual(extraerRespuestaParcial('{"answer"'), { texto: "", completa: false });
  assert.deepEqual(extraerRespuestaParcial('{"answer":'), { texto: "", completa: false });
  assert.deepEqual(extraerRespuestaParcial(undefined), { texto: "", completa: false });
});

test("devuelve lo que llegó del valor, y marca que todavía no terminó", () => {
  assert.deepEqual(extraerRespuestaParcial('{"answer":"Un Mal'), { texto: "Un Mal", completa: false });
  assert.deepEqual(extraerRespuestaParcial('{"answer": "Un Malbec'), { texto: "Un Malbec", completa: false });
});

test("al cerrarse la comilla, la respuesta está completa y lo que sigue no cuenta", () => {
  const r = extraerRespuestaParcial('{"answer":"Un Malbec.","picks":["x"],"followups":["¿Y?"]}');
  assert.deepEqual(r, { texto: "Un Malbec.", completa: true });
});

test("decodifica los escapes: salto de línea, comillas, barra, tab", () => {
  const r = extraerRespuestaParcial('{"answer":"Línea 1\\nLínea \\"2\\"\\\\ fin\\t."}');
  assert.equal(r.texto, 'Línea 1\nLínea "2"\\ fin\t.');
  assert.equal(r.completa, true);
});

test("decodifica \\uXXXX, incluidos los pares sustitutos de un emoji", () => {
  assert.equal(extraerRespuestaParcial('{"answer":"caf\\u00e9 \\ud83c\\udf77"}').texto, "café 🍷");
});

test("un escape cortado a la mitad espera al próximo trozo: no emite una barra suelta", () => {
  assert.equal(extraerRespuestaParcial('{"answer":"Hola\\').texto, "Hola");
  assert.equal(extraerRespuestaParcial('{"answer":"Hola\\u00').texto, "Hola");
  assert.equal(extraerRespuestaParcial('{"answer":"Hola\\u00e').texto, "Hola");
  assert.equal(extraerRespuestaParcial('{"answer":"Hola\\u00e9').texto, "Holaé");
});

test("un 'answer' escrito adentro de otro texto no es la clave", () => {
  // El primer campo es un texto que contiene \"answer\": no tiene que confundirse con la clave.
  const r = extraerRespuestaParcial('{"nota":"dijo \\"answer\\": \\"x\\"","answer":"La buena"}');
  assert.equal(r.texto, "La buena");
});

test("respeta los espacios y saltos entre la clave y el valor (JSON con formato)", () => {
  assert.equal(extraerRespuestaParcial('{\n  "answer"  :\n  "Hola').texto, "Hola");
});

test("PROPIEDAD: cortado en cualquier posición, siempre da un prefijo del texto final, y crece sin retroceder", () => {
  const final = 'Con asado, un Malbec: "estructura" y taninos\nAbrilo un rato antes. 🍷 Café ñandú\\.';
  const json = JSON.stringify({ answer: final, picks: ["Malbec Reserva"], followups: ["¿Y de postre?"] });

  let anterior = "";
  for (let corte = 0; corte <= json.length; corte += 1) {
    const { texto } = extraerRespuestaParcial(json.slice(0, corte));
    assert.ok(final.startsWith(texto), `en el corte ${corte} "${texto}" no es un prefijo de la respuesta`);
    assert.ok(texto.startsWith(anterior), `en el corte ${corte} el texto retrocedió`);
    anterior = texto;
  }
  // Y al final llegó entero.
  assert.equal(extraerRespuestaParcial(json).texto, final);
  assert.equal(extraerRespuestaParcial(json).completa, true);
});

test("PROPIEDAD: la suma de los deltas reconstruye la respuesta exacta, aunque el JSON llegue en trozos de tamaños raros", () => {
  const final = "Un Malbec joven, bien fresco 🍷\ncon \"cuerpo medio\" y acidez.";
  const json = JSON.stringify({ answer: final, followups: ["a", "b"] });

  for (const tamano of [1, 2, 3, 5, 7, 11, 40]) {
    let recibido = "";
    let emitido = "";
    for (let i = 0; i < json.length; i += tamano) {
      recibido += json.slice(i, i + tamano);
      const { texto } = extraerRespuestaParcial(recibido);
      if (texto.length > emitido.length) emitido += texto.slice(emitido.length);
    }
    assert.equal(emitido, final, `con trozos de ${tamano}`);
  }
});
