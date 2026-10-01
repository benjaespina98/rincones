const test = require("node:test");
const assert = require("node:assert/strict");
const SommelierConversation = require("../src/models/sommelierConversation.model");
const historyController = require("../src/controllers/sommelierHistory.controller");
const { guardarTurno, tituloDe, resumir } = require("../src/services/sommelierHistory.service");

/**
 * El historial del Sommelier guarda lo más personal que tiene la app: con qué
 * come alguien, con quién, qué se puede pagar y qué no sabe de vino.
 *
 * Por eso lo que se testea acá no es que el listado ordene bien —eso lo hace
 * Mongo— sino **que ninguna consulta pueda alcanzar la charla de otra
 * persona**. Un `findById` alcanza para eso, y un ObjectId lleva el reloj
 * adentro: los de la misma hora se parecen mucho. Cada test de abajo mira que
 * el filtro lleve `userId`.
 */

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

/** Reemplaza un método del modelo y devuelve los filtros con los que se llamó. */
const espiar = (metodo, devuelve) => {
  const original = SommelierConversation[metodo];
  const llamadas = [];
  SommelierConversation[metodo] = (...args) => {
    llamadas.push(args[0]);
    // `find` encadena .select().sort().limit().lean(); los otros resuelven directo.
    if (metodo === "find") {
      const encadenable = {
        select: () => encadenable,
        sort: () => encadenable,
        limit: () => encadenable,
        lean: async () => devuelve,
      };
      return encadenable;
    }
    if (metodo === "findOne") {
      return { lean: async () => devuelve };
    }
    return Promise.resolve(devuelve);
  };
  return {
    llamadas,
    restore() { SommelierConversation[metodo] = original; },
  };
};

test("el listado filtra por usuario, no trae las de todos", async () => {
  const espia = espiar("find", []);
  const r = res();
  await historyController.list({ user: { id: "u1" } }, r, () => {});
  espia.restore();

  assert.deepEqual(espia.llamadas[0], { userId: "u1" });
});

test("abrir una conversación filtra por id Y por usuario", async () => {
  const espia = espiar("findOne", null);
  const r = res();
  await historyController.getOne({ user: { id: "u1" }, params: { id: "c9" } }, r, () => {});
  espia.restore();

  // Si el filtro fuera sólo { _id }, adivinar un id daría la charla de otro.
  assert.deepEqual(espia.llamadas[0], { _id: "c9", userId: "u1" });
});

test("la conversación de otro devuelve 404, no 403", async () => {
  // 403 confirmaría que esa conversación existe. Para quien pregunta sin
  // derecho, lo correcto es que no exista.
  const espia = espiar("findOne", null);
  const r = res();
  await historyController.getOne({ user: { id: "intruso" }, params: { id: "c9" } }, r, () => {});
  espia.restore();

  assert.equal(r.statusCode, 404);
  assert.equal(r.body.success, false);
});

test("borrar también filtra por usuario", async () => {
  const espia = espiar("findOneAndDelete", { _id: "c9" });
  const r = res();
  await historyController.remove({ user: { id: "u1" }, params: { id: "c9" } }, r, () => {});
  espia.restore();

  assert.deepEqual(espia.llamadas[0], { _id: "c9", userId: "u1" });
  assert.equal(r.statusCode, 200);
});

test("un id con forma inválida es 404 y no un error 500", async () => {
  const original = SommelierConversation.findOne;
  SommelierConversation.findOne = () => ({
    lean: async () => { const e = new Error("Cast failed"); e.name = "CastError"; throw e; },
  });
  const r = res();
  let paso = null;
  await historyController.getOne({ user: { id: "u1" }, params: { id: "no-es-un-id" } }, r, (e) => { paso = e; });
  SommelierConversation.findOne = original;

  assert.equal(r.statusCode, 404);
  assert.equal(paso, null, "no tiene que llegar al manejador de errores");
});

test("el listado manda títulos y fechas, no los mensajes", async () => {
  // Treinta conversaciones con sus mensajes serían cien veces lo que se dibuja.
  const espia = espiar("find", [
    { _id: "c1", title: "¿Qué tomo con asado?", updatedAt: new Date(), messages: [{}, {}, {}] },
  ]);
  const r = res();
  await historyController.list({ user: { id: "u1" } }, r, () => {});
  espia.restore();

  const fila = r.body.data[0];
  assert.deepEqual(Object.keys(fila).sort(), ["id", "mensajes", "title", "updatedAt"]);
  assert.equal(fila.mensajes, 3);
});

test("guardar un turno agrega a la conversación de ESA persona", async () => {
  const original = SommelierConversation.findOneAndUpdate;
  const filtros = [];
  SommelierConversation.findOneAndUpdate = async (filtro) => {
    filtros.push(filtro);
    return { _id: "c1" };
  };

  await guardarTurno({
    userId: "u1",
    conversationId: "c1",
    question: "¿Y con pescado?",
    data: { answer: "Un blanco seco." },
  });
  SommelierConversation.findOneAndUpdate = original;

  // Sin el userId, mandar el id de la charla ajena le escribiría adentro.
  assert.deepEqual(filtros[0], { _id: "c1", userId: "u1" });
});

test("si la base falla, guardar devuelve null y no rompe la respuesta", async () => {
  const original = SommelierConversation.create;
  SommelierConversation.create = async () => { throw new Error("mongo caido"); };

  const id = await guardarTurno({
    userId: "u1",
    question: "¿Qué tomo con asado?",
    data: { answer: "Malbec." },
  });
  SommelierConversation.create = original;

  assert.equal(id, null);
});

test("sin respuesta no se guarda nada", async () => {
  // Los errores y el fuera de tema no son conversación: ensuciarían el archivo
  // con turnos que nadie va a querer releer.
  assert.equal(await guardarTurno({ userId: "u1", question: "hola", data: {} }), null);
  assert.equal(await guardarTurno({ userId: "u1", question: "", data: { answer: "x" } }), null);
  assert.equal(await guardarTurno({ question: "hola", data: { answer: "x" } }), null);
});

test("el título sale de la pregunta y corta en palabra entera", () => {
  assert.equal(tituloDe("  ¿Qué tomo   con asado? "), "¿Qué tomo con asado?");

  const original = "Quiero algo para una cena de aniversario con carnes rojas y postre de chocolate";
  const largo = tituloDe(original);
  assert.ok(largo.length <= 62, `quedó en ${largo.length}`);
  assert.ok(largo.endsWith("…"));

  /**
   * La invariante de verdad: lo que queda es un prefijo del original y termina
   * justo donde el original tiene un espacio. Eso es "cortar en palabra
   * entera", y no depende de qué tan larga sea la última palabra — cortar en
   * "…rojas y…" está bien, "y" es una palabra.
   */
  const sinPuntos = largo.slice(0, -1);
  assert.ok(original.startsWith(sinPuntos), "tiene que ser un prefijo del original");
  assert.equal(original[sinPuntos.length], " ", "el corte cae en un espacio");
});

test("del vino se guarda lo justo para dibujar la tarjeta, no el documento", () => {
  const resumido = resumir({
    _id: "w1", name: "Catena Alta", winery: "Catena", type: "red", image: "u.jpg",
    quantity: 6, rating: 4.5, notes: "secreto", purchase: { price: 28000 },
  });
  // Ni el stock ni el puntaje ni lo que pagó: cambian, y mostrarlos viejos con
  // cara de actuales es peor que no mostrarlos.
  assert.deepEqual(Object.keys(resumido).sort(), ["image", "name", "type", "wineId", "winery"]);
  assert.equal(resumido.wineId, "w1");
});

/**
 * La retención. Empezó en 180 días como TTL sobre `createdAt`; cambiar ese
 * número en el schema no alcanza (Mongoose rechaza redefinir un índice
 * existente con otras opciones) y `collMod` no está permitido para el usuario de
 * la base. Por eso el plazo vive en un índice distinto, sobre `updatedAt`.
 */
test("la conversación se borra sola a los 45 días de su última actividad", () => {
  const conTtl = SommelierConversation.schema
    .indexes()
    .filter(([, opciones]) => opciones.expireAfterSeconds !== undefined);

  assert.equal(conTtl.length, 1, "tiene que haber UN solo índice con vencimiento");
  assert.deepEqual(conTtl[0][0], { updatedAt: 1 });
  assert.equal(conTtl[0][1].expireAfterSeconds, 45 * 24 * 60 * 60);
  assert.equal(SommelierConversation.DIAS_DE_RETENCION, 45);
});

test("createdAt no lleva vencimiento: redefinir el índice viejo chocaría con la base", () => {
  assert.equal(SommelierConversation.schema.path("createdAt").options.expires, undefined);
});

/**
 * Borrar todo el historial. Un deleteMany sin filtro de usuario borra la
 * colección de TODAS las personas: lo que se prueba es que el filtro lleve el
 * userId y que sin userId no se toque la base.
 */
test("borrar todo filtra por el usuario y nada más", async () => {
  const espia = espiar("deleteMany", { deletedCount: 3 });
  const r = res();
  await historyController.removeAll({ user: { id: "u1" } }, r, () => {});
  espia.restore();

  assert.deepEqual(espia.llamadas, [{ userId: "u1" }]);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { success: true, data: { borradas: 3 } });
});

test("borrar todo SIN usuario no llama a la base: un filtro vacío borraría las de todos", async () => {
  const espia = espiar("deleteMany", { deletedCount: 99 });
  const r = res();
  await historyController.removeAll({ user: undefined }, r, () => {});
  await historyController.removeAll({ user: { id: "" } }, r, () => {});
  espia.restore();

  assert.equal(espia.llamadas.length, 0);
  assert.equal(r.statusCode, 401);
});

test("borrar todo cuando no hay nada es un 200 con cero, no un error", async () => {
  const espia = espiar("deleteMany", { deletedCount: 0 });
  const r = res();
  await historyController.removeAll({ user: { id: "u1" } }, r, () => {});
  espia.restore();

  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.borradas, 0);
});

test("si la base falla, el error va al manejador y no se pierde en silencio", async () => {
  const original = SommelierConversation.deleteMany;
  SommelierConversation.deleteMany = () => Promise.reject(new Error("caída"));
  let recibido = null;
  await historyController.removeAll({ user: { id: "u1" } }, res(), (e) => { recibido = e; });
  SommelierConversation.deleteMany = original;

  assert.equal(recibido?.message, "caída");
});
