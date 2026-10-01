const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const WineWish = require("../src/models/wineWish.model");
const User = require("../src/models/user.model");
const SommelierAnswer = require("../src/models/sommelierAnswer.model");
const sommelier = require("../src/services/sommelier.service");
const historial = require("../src/services/sommelierHistory.service");
const { askStream, FUERA_DE_TEMA } = require("../src/controllers/sommelier.controller");

/**
 * La respuesta escribiéndose (SSE).
 *
 * Lo que se prueba es el protocolo: que los pedazos salgan como `texto`, que el cuerpo
 * completo (con los vinos y los ids del historial) cierre como `final`, que un error ANTES
 * de empezar sea un JSON normal y uno DESPUÉS sea un evento `error`, y que si la persona se
 * va se corte la llamada a Gemini. Todo lo que se decide antes del modelo —el portero, la
 * caché— es lo mismo que en `ask` y sale como un único `final`.
 */

/** Una respuesta de Express que registra lo que se le escribe. */
const crearRes = () => {
  const r = {
    statusCode: null,
    headers: null,
    escrito: "",
    terminada: false,
    json: null,
    oyentes: {},
    writeHead(status, headers) { r.statusCode = status; r.headers = headers; },
    flushHeaders() {},
    write(texto) { if (r.terminada) throw new Error("se escribió después de terminar"); r.escrito += texto; },
    end() { r.terminada = true; },
    on(nombre, f) { r.oyentes[nombre] = f; },
    status(c) { r.statusCode = c; return r; },
    // `.json()` de Express: responde con JSON y termina.
    cuerpoJson: null,
  };
  r.json = (cuerpo) => { r.cuerpoJson = cuerpo; r.terminada = true; return r; };
  r.cerrarDesdeElCliente = () => r.oyentes.close?.();
  return r;
};

/** Los eventos SSE ya parseados. */
const eventos = (res) =>
  res.escrito
    .split("\n\n")
    .filter(Boolean)
    .map((bloque) => {
      const nombre = /^event: (.+)$/m.exec(bloque)?.[1];
      const datos = JSON.parse(/^data: (.+)$/m.exec(bloque)[1]);
      return { nombre, datos };
    });

const parchar = (objeto, propiedad, valor) => {
  const original = objeto[propiedad];
  objeto[propiedad] = valor;
  return () => { objeto[propiedad] = original; };
};

const cadena = (valor) => {
  const c = { select: () => c, sort: () => c, limit: () => c, lean: () => c, catch: () => Promise.resolve(valor), then: (f) => Promise.resolve(valor).then(f) };
  return c;
};

const RESULTADO = { answer: "Un Malbec.", picks: [], followups: ["¿Y de postre?"], offTopic: false, recipeFor: "" };

/** Parcha modelos y servicios. `enVivo(args)` simula a Gemini y recibe `onTexto` y `signal`. */
const entorno = ({ enVivo, guardar } = {}) => {
  const restauraciones = [
    parchar(Wine, "find", () => cadena([])),
    parchar(WineWish, "find", () => cadena([])),
    parchar(User, "findById", () => cadena(null)),
    parchar(SommelierAnswer, "findOne", () => ({ lean: async () => null })),
    parchar(SommelierAnswer, "updateOne", async () => ({})),
    parchar(sommelier, "preguntarEnVivo", async (args) => {
      entorno.args = args;
      return enVivo(args);
    }),
    parchar(historial, "guardarTurnoDetallado", async (a) => {
      entorno.guardado = a;
      return guardar === undefined ? { id: "conv1", mensajeId: "msg1" } : guardar;
    }),
  ];
  entorno.args = null;
  entorno.guardado = null;
  return () => restauraciones.forEach((r) => r());
};

const pedido = (body = {}) => ({ user: { id: "u1" }, body: { question: "¿Qué tomo con un asado?", ...body } });

test("las cabeceras son las de un stream: sin caché, sin transformaciones, sin buffer del proxy", async () => {
  const restaurar = entorno({ enVivo: async () => RESULTADO });
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  restaurar();
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /^text\/event-stream/);
  assert.match(res.headers["Cache-Control"], /no-cache/);
  assert.match(res.headers["Cache-Control"], /no-transform/);
  assert.equal(res.headers["X-Accel-Buffering"], "no");
});

test("los pedazos salen como eventos `texto` (sólo lo nuevo) y el cuerpo completo cierra como `final`", async () => {
  const restaurar = entorno({
    enVivo: async ({ onTexto }) => {
      onTexto("Un ");
      onTexto("Un Malbec");
      onTexto("Un Malbec.");
      return RESULTADO;
    },
  });
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  restaurar();

  const ev = eventos(res);
  assert.deepEqual(
    ev.map((e) => e.nombre),
    ["texto", "texto", "texto", "final"]
  );
  assert.deepEqual(ev.slice(0, 3).map((e) => e.datos.delta), ["Un ", "Malbec", "."]);
  assert.equal(ev[0].datos.delta + ev[1].datos.delta + ev[2].datos.delta, "Un Malbec.");
  assert.equal(ev[3].datos.status, 200);
  assert.equal(ev[3].datos.data.answer, "Un Malbec.");
  assert.equal(ev[3].datos.conversationId, "conv1");
  assert.equal(ev[3].datos.mensajeId, "msg1");
  assert.equal(res.terminada, true);
});

test("un texto que no creció (el mismo largo) no genera un evento vacío", async () => {
  const restaurar = entorno({
    enVivo: async ({ onTexto }) => {
      onTexto("Hola");
      onTexto("Hola");
      onTexto("");
      return RESULTADO;
    },
  });
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  restaurar();
  assert.equal(eventos(res).filter((e) => e.nombre === "texto").length, 1);
});

test("el historial se guarda con la respuesta que de verdad salió, igual que en `ask`", async () => {
  const restaurar = entorno({ enVivo: async () => RESULTADO });
  await askStream(pedido(), crearRes(), () => {});
  const guardado = entorno.guardado;
  restaurar();
  assert.equal(guardado.question, "¿Qué tomo con un asado?");
  assert.equal(guardado.data.answer, "Un Malbec.");
  assert.equal(guardado.userId, "u1");
});

test("lo que decide el portero sale como UN solo evento `final`, sin llamar al modelo", async () => {
  const restaurar = entorno({ enVivo: async () => { throw new Error("no debería llamarse"); } });
  const res = crearRes();
  await askStream(pedido({ question: "¿Quién ganó el mundial?" }), res, () => {});
  const llamado = entorno.args;
  restaurar();

  assert.equal(llamado, null);
  const ev = eventos(res);
  assert.deepEqual(ev.map((e) => e.nombre), ["final"]);
  assert.deepEqual(ev[0].datos.data, FUERA_DE_TEMA);
});

test("una pregunta demasiado corta es un 400 en JSON normal, no un evento", async () => {
  const restaurar = entorno({ enVivo: async () => RESULTADO });
  const res = crearRes();
  await askStream(pedido({ question: "a" }), res, () => {});
  restaurar();
  assert.equal(res.statusCode, 400);
  assert.equal(res.escrito, "");
  assert.ok(res.cuerpoJson.message);
});

test("si el modelo no devuelve nada ANTES de escribir, es un 503 en JSON normal", async () => {
  const restaurar = entorno({ enVivo: async () => null });
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  restaurar();
  assert.equal(res.statusCode, 503);
  assert.equal(res.escrito, "");
});

test("si el modelo falla ANTES de escribir, es un 503 en JSON normal y el error se registra", async () => {
  const restaurar = entorno({ enVivo: async () => { throw new Error("saturado"); } });
  const silencio = parchar(console, "error", () => {});
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  silencio();
  restaurar();
  assert.equal(res.statusCode, 503);
  assert.equal(res.escrito, "");
});

test("si el modelo falla DESPUÉS de haber escrito, sale un evento `error` y se cierra: no queda colgado", async () => {
  const restaurar = entorno({
    enVivo: async ({ onTexto }) => {
      onTexto("Con un asa");
      throw Object.assign(new Error("se cortó la red"), { parcial: true });
    },
  });
  const silencio = parchar(console, "error", () => {});
  const res = crearRes();
  await askStream(pedido(), res, () => {});
  silencio();
  restaurar();

  const ev = eventos(res);
  assert.deepEqual(ev.map((e) => e.nombre), ["texto", "error"]);
  assert.equal(ev[1].datos.status, 503);
  assert.ok(ev[1].datos.message);
  assert.equal(res.terminada, true);
});

test("si la persona se va, se corta la llamada a Gemini", async () => {
  let senal;
  const restaurar = entorno({
    enVivo: async ({ signal }) => {
      senal = signal;
      assert.equal(signal.aborted, false);
      return RESULTADO;
    },
  });
  const res = crearRes();
  const promesa = askStream(pedido(), res, () => {});
  res.cerrarDesdeElCliente();
  await promesa;
  restaurar();
  assert.equal(senal.aborted, true);
});

test("pasa al modelo la misma pregunta, historial y contexto que `ask`", async () => {
  const restaurar = entorno({ enVivo: async () => RESULTADO });
  await askStream(
    pedido({ history: [{ role: "user", text: "hola" }, { role: "assistant", text: "¡Hola!" }] }),
    crearRes(),
    () => {}
  );
  const args = entorno.args;
  restaurar();
  assert.equal(args.question, "¿Qué tomo con un asado?");
  assert.equal(args.history.length, 2);
  assert.equal(typeof args.onTexto, "function");
  assert.ok(args.signal);
});
