const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SommelierConversation = require("../src/models/sommelierConversation.model");
const historyController = require("../src/controllers/sommelierHistory.controller");
const { guardarTurnoDetallado, guardarTurno } = require("../src/services/sommelierHistory.service");
const { armarPrompt } = require("../src/services/sommelier.service");

/**
 * El pulgar y "otra opción" apuntan a UN mensaje por su id.
 *
 * Lo que se prueba es lo que no se ve: que cada consulta lleve `userId` (un id
 * de mensaje ajeno no puede matchear), que "otra opción" REEMPLACE en lugar de
 * agregar (la pregunta no se repite) y que opinar sobre una charla vieja no la
 * suba al tope de la lista.
 */

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

/** Reemplaza un método estático del modelo y guarda TODOS los argumentos de cada llamada. */
const espiar = (metodo, devuelve) => {
  const original = SommelierConversation[metodo];
  const llamadas = [];
  SommelierConversation[metodo] = (...args) => {
    llamadas.push(args);
    return Promise.resolve(typeof devuelve === "function" ? devuelve(...args) : devuelve);
  };
  return { llamadas, restore() { SommelierConversation[metodo] = original; } };
};

const DATA = { answer: "Un Malbec.", wines: [], descubrir: [], followups: ["¿Con qué?"] };
const ID_MSG = new mongoose.Types.ObjectId().toString();
const ID_CONV = new mongoose.Types.ObjectId().toString();

/* ── guardarTurnoDetallado ─────────────────────────────────────────────────── */

test("al crear una conversación devuelve el id de la conversación y el del mensaje del asistente", async () => {
  const espia = espiar("create", (doc) => ({ _id: new mongoose.Types.ObjectId(ID_CONV), ...doc }));
  const r = await guardarTurnoDetallado({ userId: "u1", question: "¿Qué tomo?", data: DATA });
  espia.restore();

  assert.equal(r.id, ID_CONV);
  assert.ok(mongoose.isValidObjectId(r.mensajeId));
  // El id que se devuelve es el del mensaje del ASISTENTE, el segundo del turno.
  const turno = espia.llamadas[0][0].messages;
  assert.equal(turno[1].role, "assistant");
  assert.equal(String(turno[1]._id), r.mensajeId);
  assert.equal(turno[0]._id, undefined);
});

test("al agregar a una conversación existente también devuelve el id del mensaje", async () => {
  const espia = espiar("findOneAndUpdate", { _id: new mongoose.Types.ObjectId(ID_CONV) });
  const r = await guardarTurnoDetallado({
    userId: "u1",
    conversationId: ID_CONV,
    question: "¿Y con pescado?",
    data: DATA,
  });
  espia.restore();

  assert.equal(r.id, ID_CONV);
  assert.ok(mongoose.isValidObjectId(r.mensajeId));
  assert.deepEqual(espia.llamadas[0][0], { _id: ID_CONV, userId: "u1" });
});

test("'otra opción' REEMPLAZA el mensaje en su lugar: no agrega un turno ni repite la pregunta", async () => {
  const espia = espiar("findOneAndUpdate", { _id: new mongoose.Types.ObjectId(ID_CONV) });
  const r = await guardarTurnoDetallado({
    userId: "u1",
    conversationId: ID_CONV,
    question: "¿Qué tomo?",
    data: DATA,
    reemplazaMensajeId: ID_MSG,
  });
  espia.restore();

  assert.equal(espia.llamadas.length, 1, "un solo update: el reemplazo");
  const [filtro, cambio] = espia.llamadas[0];
  assert.equal(filtro.userId, "u1");
  assert.equal(String(filtro._id), ID_CONV);
  assert.equal(String(filtro.messages.$elemMatch._id), ID_MSG);
  assert.equal(filtro.messages.$elemMatch.role, "assistant");
  assert.deepEqual(Object.keys(cambio), ["$set"]);
  assert.equal(cambio.$set["messages.$"].role, "assistant");
  assert.equal(cambio.$set["messages.$"].text, "Un Malbec.");
  assert.equal(String(cambio.$set["messages.$"]._id), r.mensajeId);
  assert.notEqual(r.mensajeId, ID_MSG, "la respuesta nueva es otro mensaje");
});

test("si el mensaje a reemplazar ya no existe, se agrega como un turno normal", async () => {
  let llamada = 0;
  const espia = espiar("findOneAndUpdate", () => (++llamada === 1 ? null : { _id: new mongoose.Types.ObjectId(ID_CONV) }));
  const r = await guardarTurnoDetallado({
    userId: "u1",
    conversationId: ID_CONV,
    question: "¿Qué tomo?",
    data: DATA,
    reemplazaMensajeId: ID_MSG,
  });
  espia.restore();

  assert.equal(espia.llamadas.length, 2);
  assert.ok(espia.llamadas[1][1].$push, "el segundo intento es un $push");
  assert.equal(r.id, ID_CONV);
});

test("un id de mensaje con forma inválida no llega a la base como reemplazo", async () => {
  const espia = espiar("findOneAndUpdate", { _id: new mongoose.Types.ObjectId(ID_CONV) });
  await guardarTurnoDetallado({
    userId: "u1",
    conversationId: ID_CONV,
    question: "¿Qué tomo?",
    data: DATA,
    reemplazaMensajeId: "no-es-un-id",
  });
  espia.restore();

  assert.equal(espia.llamadas.length, 1);
  assert.ok(espia.llamadas[0][1].$push);
});

test("sin usuario o sin respuesta no guarda nada", async () => {
  const espia = espiar("create", {});
  assert.equal(await guardarTurnoDetallado({ question: "x", data: DATA }), null);
  assert.equal(await guardarTurnoDetallado({ userId: "u1", question: "x", data: {} }), null);
  espia.restore();
  assert.equal(espia.llamadas.length, 0);
});

test("guardarTurno sigue devolviendo sólo el id, como siempre", async () => {
  const espia = espiar("create", (doc) => ({ _id: new mongoose.Types.ObjectId(ID_CONV), ...doc }));
  const id = await guardarTurno({ userId: "u1", question: "¿Qué tomo?", data: DATA });
  espia.restore();
  assert.equal(id, ID_CONV);
});

/* ── El pulgar ─────────────────────────────────────────────────────────────── */

test("el pulgar filtra por usuario y por mensaje del asistente, y no toca updatedAt", async () => {
  const espia = espiar("updateOne", { matchedCount: 1 });
  const r = res();
  await historyController.feedback(
    { user: { id: "u1" }, params: { id: ID_CONV }, body: { mensajeId: ID_MSG, valor: "up" } },
    r,
    () => {}
  );
  espia.restore();

  const [filtro, cambio, opciones] = espia.llamadas[0];
  assert.equal(filtro.userId, "u1");
  assert.equal(filtro._id, ID_CONV);
  assert.equal(filtro.messages.$elemMatch.role, "assistant");
  assert.equal(filtro.messages.$elemMatch._id, ID_MSG);
  assert.deepEqual(cambio, { $set: { "messages.$.feedback": "up" } });
  assert.deepEqual(opciones, { timestamps: false });
  assert.equal(r.statusCode, 200);
});

test("quitar el pulgar (null) borra el campo en vez de guardar un null", async () => {
  const espia = espiar("updateOne", { matchedCount: 1 });
  await historyController.feedback(
    { user: { id: "u1" }, params: { id: ID_CONV }, body: { mensajeId: ID_MSG, valor: null } },
    res(),
    () => {}
  );
  espia.restore();
  assert.deepEqual(espia.llamadas[0][1], { $unset: { "messages.$.feedback": "" } });
});

test("un pulgar sobre una respuesta ajena o inexistente da 404, como cualquier otra", async () => {
  const espia = espiar("updateOne", { matchedCount: 0 });
  const r = res();
  await historyController.feedback(
    { user: { id: "u1" }, params: { id: ID_CONV }, body: { mensajeId: ID_MSG, valor: "down" } },
    r,
    () => {}
  );
  espia.restore();
  assert.equal(r.statusCode, 404);
});

test("valores inválidos: pulgar desconocido es 400 y un id con forma inválida es 404, sin tocar la base", async () => {
  const espia = espiar("updateOne", { matchedCount: 1 });
  const a = res();
  await historyController.feedback(
    { user: { id: "u1" }, params: { id: ID_CONV }, body: { mensajeId: ID_MSG, valor: "genial" } },
    a,
    () => {}
  );
  const b = res();
  await historyController.feedback(
    { user: { id: "u1" }, params: { id: ID_CONV }, body: { mensajeId: "x", valor: "up" } },
    b,
    () => {}
  );
  espia.restore();

  assert.equal(a.statusCode, 400);
  assert.equal(b.statusCode, 404);
  assert.equal(espia.llamadas.length, 0);
});

/* ── El modelo y el prompt ─────────────────────────────────────────────────── */

test("los mensajes del historial tienen _id propio y un pulgar con sólo dos valores", () => {
  const mensajes = SommelierConversation.schema.path("messages").schema;
  assert.ok(mensajes.path("_id"), "cada mensaje tiene _id");
  assert.deepEqual(mensajes.path("feedback").enumValues, ["up", "down"]);
});

test("'otra opción' le muestra al modelo la respuesta anterior para que NO la repita", () => {
  const con = armarPrompt({ question: "¿Qué tomo?", evitar: "Un Malbec joven." });
  assert.match(con, /OTRA OPCIÓN/);
  assert.match(con, /Un Malbec joven\./);
  assert.ok(con.indexOf("OTRA OPCIÓN") < con.indexOf("PREGUNTA"));

  const sin = armarPrompt({ question: "¿Qué tomo?" });
  assert.doesNotMatch(sin, /OTRA OPCIÓN/);
});

test("la respuesta anterior se recorta: no puede inflar el prompt", () => {
  const base = armarPrompt({ question: "¿Qué tomo?" }).length;
  const conLargo = armarPrompt({ question: "¿Qué tomo?", evitar: "x".repeat(5000) }).length;
  // Suma el recorte (400) y el texto de la indicación, no los 5000 de entrada.
  assert.ok(conLargo - base < 800, `sumó ${conLargo - base} caracteres`);
});
