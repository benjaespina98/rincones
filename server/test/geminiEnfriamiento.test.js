const test = require("node:test");
const assert = require("node:assert/strict");
const { generateJson, olvidarModelosSinPensamiento, getModelChain } = require("../src/services/gemini.service");

/**
 * Un modelo que falla se aparta un rato.
 *
 * La cuota de Gemini es POR MODELO: uno que devolvió 429 (cupo del día) o 503 (saturado) lo
 * va a volver a devolver en la próxima pregunta. Sin memoria, cada consulta de cada persona
 * empezaba golpeando al mismo modelo caído y perdía tiempo (un 503 tarda ~14 s) o gastaba un
 * pedido contra una cuota agotada. Lo que se prueba: el que falló no se vuelve a intentar
 * mientras se enfría, la cadena sigue por el siguiente, y si no queda ninguno libre se usa
 * la cadena entera en vez de no contestar.
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

const OK = () =>
  respuesta({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"answer":"Un Malbec."}' }] } }],
  });

/** fetch según el modelo al que se llama; deja registro del orden. */
const simular = (porModelo) => {
  const modelos = [];
  global.fetch = async (url) => {
    const modelo = String(url).match(/models\/([^:]+):/)?.[1];
    modelos.push(modelo);
    return (porModelo[modelo] || OK)();
  };
  return modelos;
};

const llamar = () =>
  generateJson({ parts: [{ text: "hola" }], schema: { type: "object" }, timeoutMs: 2000, budgetMs: 10000 });

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  olvidarModelosSinPensamiento();
});

test.afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

test("un 429 aparta al modelo: la pregunta siguiente ya no lo prueba", async () => {
  const modelos = simular({ [CADENA[0]]: () => respuesta({}, { status: 429 }) });

  await llamar();
  assert.deepEqual(modelos, [CADENA[0], CADENA[1]]);

  modelos.length = 0;
  await llamar();
  assert.deepEqual(modelos, [CADENA[1]], "arranca directo por el que sí responde");
});

test("un 503 también lo aparta", async () => {
  const modelos = simular({ [CADENA[0]]: () => respuesta({}, { status: 503 }) });
  await llamar();
  modelos.length = 0;
  await llamar();
  assert.equal(modelos[0], CADENA[1]);
});

test("un timeout o error de red lo aparta", async () => {
  const modelos = [];
  global.fetch = async (url) => {
    const modelo = String(url).match(/models\/([^:]+):/)?.[1];
    modelos.push(modelo);
    if (modelo === CADENA[0]) throw new Error("socket hang up");
    return OK();
  };
  await llamar();
  modelos.length = 0;
  await llamar();
  assert.equal(modelos[0], CADENA[1]);
});

test("una respuesta cortada por MAX_TOKENS NO enfría: es de esa respuesta, no del modelo", async () => {
  let primera = true;
  const modelos = simular({
    [CADENA[0]]: () => {
      if (primera) {
        primera = false;
        return respuesta({ candidates: [{ finishReason: "MAX_TOKENS" }] });
      }
      return OK();
    },
  });

  await llamar();
  modelos.length = 0;
  await llamar();
  assert.equal(modelos[0], CADENA[0], "sigue siendo el primero");
});

test("si todos fallaron, la cadena entera se vuelve a intentar en vez de quedarse sin contestar", async () => {
  const caidos = Object.fromEntries(CADENA.map((m) => [m, () => respuesta({}, { status: 503 })]));
  simular(caidos);
  await assert.rejects(llamar());

  // Se recuperan todos: ahora responden. Ninguno está libre, pero igual se intenta.
  const modelos = simular({});
  const r = await llamar();
  assert.deepEqual(r, { answer: "Un Malbec." });
  assert.equal(modelos[0], CADENA[0]);
});

test("mientras haya un modelo libre, los enfriados no se prueban", async () => {
  // Todos enfriados salvo el último, que responde.
  const caidos = Object.fromEntries(CADENA.slice(0, -1).map((m) => [m, () => respuesta({}, { status: 429 })]));
  simular(caidos);
  await llamar();

  // Todos los demás siguen enfriados, así que usa sólo el último.
  const modelos = simular({});
  await llamar();
  assert.deepEqual(modelos, [CADENA[CADENA.length - 1]]);
});
