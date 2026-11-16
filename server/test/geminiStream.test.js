const test = require("node:test");
const assert = require("node:assert/strict");
const { streamJson, olvidarModelosSinPensamiento, getModelChain } = require("../src/services/gemini.service");

/**
 * La respuesta de Gemini llegando de a trozos (SSE).
 *
 * Lo que se prueba es cómo se comporta ante las cosas que pasan de verdad: un evento
 * partido por la mitad entre dos trozos, un modelo saturado antes de empezar, y —lo más
 * delicado— una falla DESPUÉS de haber mostrado algo: ahí no se cambia de modelo, porque
 * la persona se quedaría con una frase empezada por uno y terminada por otro.
 */

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
const CADENA = getModelChain("search");

/** Un evento SSE con un trozo de la respuesta. */
const evento = (texto, finishReason) =>
  `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text: texto }] }, ...(finishReason ? { finishReason } : {}) }],
  })}\n\n`;

/** Una respuesta de fetch cuyo cuerpo entrega estos trozos de texto, en este orden. */
const flujo = (trozos, { falloAlFinal = null } = {}) => {
  const codificador = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < trozos.length) return { done: false, value: codificador.encode(trozos[i++]) };
          if (falloAlFinal) throw falloAlFinal;
          return { done: true };
        },
      }),
    },
  };
};

const error = (status) => ({ ok: false, status, text: async () => "saturado", json: async () => ({}) });

const simular = (guion) => {
  const pedidos = [];
  global.fetch = async (url, opciones) => {
    pedidos.push({ url: String(url), modelo: String(url).match(/models\/([^:]+):/)?.[1], config: JSON.parse(opciones.body).generationConfig });
    return guion.shift();
  };
  return pedidos;
};

const llamar = (extra = {}) =>
  streamJson({
    parts: [{ text: "hola" }],
    schema: { type: "object" },
    timeoutMs: 2000,
    budgetMs: 10000,
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

test("pide el endpoint de streaming (SSE) y devuelve el JSON completo al terminar", async () => {
  const pedidos = simular([flujo([evento('{"answer":"Un '), evento('Malbec."}', "STOP")])]);
  const r = await llamar();
  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.match(pedidos[0].url, /:streamGenerateContent\?alt=sse/);
});

test("va entregando por onTexto TODO lo acumulado, trozo a trozo", async () => {
  simular([flujo([evento('{"answer":"Un '), evento("Malbec"), evento('."}', "STOP")])]);
  const vistos = [];
  await llamar({ onTexto: (acumulado) => vistos.push(acumulado) });
  assert.deepEqual(vistos, ['{"answer":"Un ', '{"answer":"Un Malbec', '{"answer":"Un Malbec."}']);
});

test("un evento partido entre dos trozos de red se reconstruye bien", async () => {
  const completo = evento('{"answer":"Hola"}', "STOP");
  const corte = 17; // en medio de la línea "data: {...}"
  simular([flujo([completo.slice(0, corte), completo.slice(corte)])]);
  assert.deepEqual(await llamar(), { answer: "Hola" });
});

test("acepta los saltos de línea de Windows (\\r\\n\\r\\n) entre eventos", async () => {
  const crlf = (texto, fin) => evento(texto, fin).replace(/\n/g, "\r\n");
  simular([flujo([crlf('{"answer":"A'), crlf('B"}', "STOP")])]);
  assert.deepEqual(await llamar(), { answer: "AB" });
});

test("una línea rota o de otro tipo no tira el stream entero", async () => {
  simular([flujo(["data: {esto no es json\n\n", ": comentario\n\n", evento('{"answer":"Bien"}', "STOP")])]);
  assert.deepEqual(await llamar(), { answer: "Bien" });
});

test("sin nada mostrado todavía, un 503 pasa al modelo siguiente", async () => {
  const pedidos = simular([error(503), flujo([evento('{"answer":"Del segundo"}', "STOP")])]);
  assert.deepEqual(await llamar(), { answer: "Del segundo" });
  assert.equal(pedidos.length, 2);
  assert.notEqual(pedidos[0].modelo, pedidos[1].modelo);
});

test("sin nada mostrado todavía, un stream que termina vacío pasa al modelo siguiente", async () => {
  const pedidos = simular([flujo([]), flujo([evento('{"answer":"Del segundo"}', "STOP")])]);
  assert.deepEqual(await llamar(), { answer: "Del segundo" });
  assert.equal(pedidos.length, 2);
});

test("CON algo ya mostrado, una falla NO cambia de modelo: se propaga marcada como parcial", async () => {
  const pedidos = simular([
    flujo([evento('{"answer":"Con un asa')], { falloAlFinal: new Error("se cortó la red") }),
    flujo([evento('{"answer":"NO debería usarse"}', "STOP")]),
  ]);
  const vistos = [];
  await assert.rejects(
    () => llamar({ onTexto: (a) => vistos.push(a) }),
    (e) => e.parcial === true && /se cortó la red/.test(e.message)
  );
  assert.equal(pedidos.length, 1, "no se probó un segundo modelo");
  assert.equal(vistos.length, 1);
});

test("una respuesta cortada por MAX_TOKENS después de mostrar texto se propaga como parcial", async () => {
  const pedidos = simular([flujo([evento('{"answer":"Empez'), evento("ó", "MAX_TOKENS")])]);
  await assert.rejects(() => llamar(), (e) => e.parcial === true && /MAX_TOKENS/.test(e.message));
  assert.equal(pedidos.length, 1);
});

test("un JSON final inválido (con texto ya mostrado) se propaga como parcial", async () => {
  simular([flujo([evento('{"answer":"sin cerrar', "STOP")])]);
  await assert.rejects(() => llamar(), (e) => e.parcial === true && /JSON inválido/.test(e.message));
});

test("con sinPensamiento pide thinkingBudget 0 y, si el modelo lo rechaza (400), reintenta ESE modelo sin él", async () => {
  const pedidos = simular([error(400), flujo([evento('{"answer":"Ok"}', "STOP")])]);
  const r = await llamar({ sinPensamiento: true });
  assert.deepEqual(r, { answer: "Ok" });
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].modelo, pedidos[1].modelo);
  assert.deepEqual(pedidos[0].config.thinkingConfig, { thinkingBudget: 0 });
  assert.equal("thinkingConfig" in pedidos[1].config, false);
});

test("por defecto no manda thinkingConfig", async () => {
  const pedidos = simular([flujo([evento('{"answer":"Ok"}', "STOP")])]);
  await llamar();
  assert.equal("thinkingConfig" in pedidos[0].config, false);
});

test("si quien llama cancela (cerró la pantalla), no se sigue con otro modelo", async () => {
  const control = new AbortController();
  const pedidos = simular([
    flujo([evento('{"answer":"A')], { falloAlFinal: Object.assign(new Error("abortado"), { name: "AbortError" }) }),
    flujo([evento('{"answer":"B"}', "STOP")]),
  ]);
  control.abort();
  await assert.rejects(() => llamar({ signal: control.signal }), /cancelada|abortado/i);
  assert.ok(pedidos.length <= 1);
});

test("la cadena de modelos es la de siempre", () => {
  assert.ok(CADENA.length >= 2);
});

test("la API key viaja en la cabecera x-goog-api-key y NUNCA en la URL (stream)", async () => {
  let visto;
  global.fetch = async (url, opciones) => {
    visto = { url: String(url), headers: opciones.headers };
    return flujo([evento('{"answer":"ok"}', "STOP")]);
  };
  await llamar();
  assert.ok(!visto.url.includes("clave-de-prueba"), "la clave no puede estar en la URL");
  assert.ok(!/[?&]key=/.test(visto.url));
  assert.equal(visto.headers["x-goog-api-key"], "clave-de-prueba");
});

test("la API key viaja en la cabecera y NUNCA en la URL (sin stream)", async () => {
  const { generateJson } = require("../src/services/gemini.service");
  let visto;
  global.fetch = async (url, opciones) => {
    visto = { url: String(url), headers: opciones.headers };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] }, finishReason: "STOP" }],
      }),
      text: async () => "",
    };
  };
  await generateJson({ parts: [{ text: "hola" }], schema: { type: "object" }, timeoutMs: 2000, budgetMs: 10000 });
  assert.ok(!visto.url.includes("clave-de-prueba"));
  assert.ok(!/[?&]key=/.test(visto.url));
  assert.equal(visto.headers["x-goog-api-key"], "clave-de-prueba");
});
