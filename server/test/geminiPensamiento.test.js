const test = require("node:test");
const assert = require("node:assert/strict");
const { generateJson, olvidarModelosSinPensamiento, getModelChain } = require("../src/services/gemini.service");

/**
 * Pedirle a Gemini que NO piense (`thinkingBudget: 0`).
 *
 * Medido contra la API, los modelos "flash" nuevos gastaban el presupuesto de tokens
 * pensando (cortaban la respuesta) y tardaban de más; sin pensar contestan en ~1,6 s. Pero
 * algunos modelos rechazan el parámetro con un 400, y ahí no puede fallar la consulta: se
 * reintenta ESE modelo sin el parámetro, y se lo recuerda. Lo que se prueba es eso, más que
 * la opción NO cambie nada para quien no la pide (el escáner de etiquetas usa la misma función).
 */

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
const CADENA = getModelChain("search");

const respuesta = (cuerpo, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  text: async () => JSON.stringify(cuerpo),
});

const OK = respuesta({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"answer":"Un Malbec."}' }] } }],
});

/** Simula fetch con un guion de respuestas, y deja registro de cada pedido. */
const simular = (guion) => {
  const pedidos = [];
  global.fetch = async (url, opciones) => {
    const modelo = String(url).match(/models\/([^:]+):/)?.[1];
    const cuerpo = JSON.parse(opciones.body);
    pedidos.push({ modelo, config: cuerpo.generationConfig });
    const paso = guion.shift();
    return typeof paso === "function" ? paso({ modelo, config: cuerpo.generationConfig }) : paso;
  };
  return pedidos;
};

const llamar = (extra = {}) =>
  generateJson({
    parts: [{ text: "hola" }],
    schema: { type: "object" },
    timeoutMs: 2000,
    budgetMs: 10000,
    maxOutputTokens: 100,
    ...extra,
  });

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  olvidarModelosSinPensamiento();
});

test.afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

test("por defecto NO se manda thinkingConfig: quien no lo pide no cambia en nada", async () => {
  const pedidos = simular([OK]);
  await llamar();
  assert.equal(pedidos.length, 1);
  assert.equal("thinkingConfig" in pedidos[0].config, false);
});

test("con sinPensamiento se pide thinkingBudget 0", async () => {
  const pedidos = simular([OK]);
  const r = await llamar({ sinPensamiento: true });
  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.deepEqual(pedidos[0].config.thinkingConfig, { thinkingBudget: 0 });
});

test("si el modelo lo rechaza (400), se reintenta ESE modelo sin el parámetro y se devuelve la respuesta", async () => {
  const pedidos = simular([respuesta({ error: { message: "Request contains an invalid argument." } }, { status: 400 }), OK]);
  const r = await llamar({ sinPensamiento: true });

  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].modelo, pedidos[1].modelo, "es el MISMO modelo, no el siguiente de la cadena");
  assert.ok(pedidos[0].config.thinkingConfig);
  assert.equal("thinkingConfig" in pedidos[1].config, false);
});

test("el modelo que lo rechazó se recuerda: la llamada siguiente ya no pierde el primer intento", async () => {
  simular([respuesta({}, { status: 400 }), OK]);
  await llamar({ sinPensamiento: true });

  const pedidos = simular([OK]);
  await llamar({ sinPensamiento: true });
  assert.equal(pedidos.length, 1, "un solo pedido: ya sabe que ese modelo no lo acepta");
  assert.equal("thinkingConfig" in pedidos[0].config, false);
  assert.equal(pedidos[0].modelo, CADENA[0]);
});

test("un 400 SIN la opción sigue siendo un error de verdad: si todos fallan, el error es el 400", async () => {
  const todosMal = CADENA.map(() => respuesta({ error: { message: "mal" } }, { status: 400 }));
  const pedidos = simular(todosMal);
  await assert.rejects(() => llamar(), /HTTP 400/);
  // Sin la opción nunca se manda thinkingConfig, así que no hay nada que reintentar por eso.
  assert.ok(pedidos.every((p) => !("thinkingConfig" in p.config)));
});

test("un 503 (saturado) pasa al siguiente modelo, como siempre", async () => {
  const pedidos = simular([respuesta({}, { status: 503 }), OK]);
  const r = await llamar({ sinPensamiento: true });
  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.equal(pedidos.length, 2);
  assert.notEqual(pedidos[0].modelo, pedidos[1].modelo);
});

test("una respuesta cortada (MAX_TOKENS) pasa al siguiente modelo, como siempre", async () => {
  const cortada = respuesta({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"ans' }] } }] });
  const pedidos = simular([cortada, OK]);
  const r = await llamar({ sinPensamiento: true });
  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.equal(pedidos.length, 2);
});

test("el reintento por el 400 no cuenta como un modelo fallido: la cadena sigue intacta", async () => {
  // Primer modelo: 400 → reintento OK. Si contara como fallo, el segundo pedido iría al
  // modelo siguiente y la respuesta saldría de un modelo de menor preferencia.
  const pedidos = simular([respuesta({}, { status: 400 }), OK]);
  await llamar({ sinPensamiento: true });
  assert.equal(pedidos[1].modelo, CADENA[0]);
});
