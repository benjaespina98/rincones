const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const {
  availableFromLots,
  normalizeLots,
  appendLot,
  consumeFromLots,
  returnToLastOpenedLot,
  reconcileLots,
  buildStockStages,
} = require("../src/utils/lots");

const dia = (d) => new Date(`2024-0${d}-01T12:00:00.000Z`);

// Cómo quedó cada lote: "loQueEntró/loQueQueda@fecha".
const forma = (lots) => lots.map((l) => `${l.quantity}/${l.remaining}@${l.addedAt.getUTCMonth() + 1}`);

// Cuántas botellas pasaron por la cava, se hayan tomado o no.
const entraron = (lots) => lots.reduce((total, l) => total + l.quantity, 0);

// La respuesta de "en cava desde": el lote más viejo que TODAVÍA tiene stock.
// El cliente hace lo mismo en `enCavaDesde` a partir del mismo array.
const desdeCuando = (lots) => lots.find((l) => l.remaining > 0)?.addedAt;

// --- Lote inicial -----------------------------------------------------------

test("un vino sin lotes deriva el inicial de su quantity y su fecha de alta", () => {
  const lotes = normalizeLots([], { quantity: 5, createdAt: dia(3) });

  assert.deepEqual(forma(lotes), ["5/5@3"], "entraron 5 y siguen las 5");
  assert.deepEqual(lotes[0].addedAt, dia(3));
});

test("un vino sin stock no genera ningún lote", () => {
  assert.deepEqual(normalizeLots([], { quantity: 0, createdAt: dia(3) }), []);
});

test("crear un vino le deja su lote inicial y quantity en sincronía", async () => {
  const vino = new Wine({ userId: "507f1f77bcf86cd799439011", name: "Malbec", quantity: 3 });
  await vino.validate();

  assert.equal(vino.lots.length, 1, "una compra, un lote");
  assert.equal(vino.lots[0].quantity, 3, "entraron 3");
  assert.equal(vino.lots[0].remaining, 3, "y quedan 3");
  assert.equal(vino.quantity, 3);
  assert.equal(
    vino.lots[0].addedAt.getTime(),
    vino.createdAt.getTime(),
    "el lote inicial entró el día que cargaste el vino"
  );
});

test("un lote de la versión anterior (sin remaining) se completa solo", () => {
  const lotes = normalizeLots([{ addedAt: dia(1), quantity: 4 }]);
  assert.deepEqual(forma(lotes), ["4/4@1"], "sin dato de consumo, todo lo que entró sigue estando");
});

// --- Reposición -------------------------------------------------------------

test("reponer agrega un lote nuevo en vez de engordar el viejo", () => {
  const lotes = appendLot([{ addedAt: dia(1), quantity: 5, remaining: 5 }], 3, { addedAt: dia(6) });

  assert.deepEqual(forma(lotes), ["5/5@1", "3/3@6"]);
  assert.equal(availableFromLots(lotes), 8, "5 que tenías + 3 que compraste");
});

test("los lotes quedan siempre ordenados del más viejo al más nuevo", () => {
  const lotes = appendLot([{ addedAt: dia(6), quantity: 2, remaining: 2 }], 4, { addedAt: dia(2) });
  assert.deepEqual(forma(lotes), ["4/4@2", "2/2@6"]);
});

// --- Consumo FIFO -----------------------------------------------------------

test("consumir descuenta del lote más viejo", () => {
  const lotes = consumeFromLots(
    [
      { addedAt: dia(1), quantity: 3, remaining: 3 },
      { addedAt: dia(6), quantity: 5, remaining: 5 },
    ],
    2
  );

  assert.deepEqual(forma(lotes), ["3/1@1", "5/5@6"], "salieron del lote de enero");
  assert.equal(availableFromLots(lotes), 6);
});

// --- Trazabilidad: el lote agotado NO se borra ------------------------------

test("el lote que se agota queda en el historial, con lo que trajo y cuándo se terminó", () => {
  const lotes = consumeFromLots(
    [
      { addedAt: dia(1), quantity: 3, remaining: 3 },
      { addedAt: dia(6), quantity: 5, remaining: 5 },
    ],
    3,
    { consumedAt: dia(7) }
  );

  assert.equal(lotes.length, 2, "las 3 botellas de enero existieron: el lote se queda");
  assert.deepEqual(forma(lotes), ["3/0@1", "5/5@6"]);
  assert.deepEqual(lotes[0].depletedAt, dia(7), "queda registrado cuándo se terminó");
  assert.deepEqual(lotes[1].depletedAt, undefined, "el que tiene stock no está agotado");

  assert.equal(availableFromLots(lotes), 5, "el stock es lo que queda");
  assert.equal(entraron(lotes), 8, "por la cava pasaron 8 botellas");
  assert.deepEqual(
    desdeCuando(lotes),
    dia(6),
    "lo que queda entró en junio, aunque el lote de enero siga en el historial"
  );
});

test("consumos sucesivos vacían un lote y siguen con el siguiente, sin perder ninguno", () => {
  let lotes = [
    { addedAt: dia(1), quantity: 2, remaining: 2 },
    { addedAt: dia(5), quantity: 2, remaining: 2 },
  ];

  lotes = consumeFromLots(lotes, 1);
  assert.deepEqual(forma(lotes), ["2/1@1", "2/2@5"]);

  lotes = consumeFromLots(lotes, 1);
  assert.deepEqual(forma(lotes), ["2/0@1", "2/2@5"], "se agotó el de enero, pero sigue ahí");

  lotes = consumeFromLots(lotes, 1);
  assert.deepEqual(forma(lotes), ["2/0@1", "2/1@5"], "ahora se toma del de mayo");

  lotes = consumeFromLots(lotes, 1);
  assert.deepEqual(forma(lotes), ["2/0@1", "2/0@5"], "cava vacía, historial completo");
  assert.equal(availableFromLots(lotes), 0);
  assert.equal(entraron(lotes), 4, "se sabe que pasaron 4 botellas y de qué compra salió cada una");
});

test("pedir más botellas de las que hay no deja stock negativo", () => {
  const lotes = consumeFromLots([{ addedAt: dia(1), quantity: 2, remaining: 2 }], 10);

  assert.deepEqual(forma(lotes), ["2/0@1"]);
  assert.equal(availableFromLots(lotes), 0);
  assert.equal(availableFromLots(consumeFromLots([], 5)), 0, "consumir de una cava vacía no rompe");
});

test("el historial se conserva al reponer sobre un vino que se había terminado", () => {
  const agotado = [{ addedAt: dia(1), quantity: 3, remaining: 0, depletedAt: dia(4) }];
  const lotes = appendLot(agotado, 2, { addedAt: dia(6) });

  assert.deepEqual(forma(lotes), ["3/0@1", "2/2@6"]);
  assert.equal(availableFromLots(lotes), 2);
  assert.deepEqual(desdeCuando(lotes), dia(6), "lo que tenés es de junio");
});

// --- Deshacer ---------------------------------------------------------------

test("devolver una botella vuelve al lote del que salió, no crea uno nuevo", () => {
  const lotes = returnToLastOpenedLot(
    [
      { addedAt: dia(1), quantity: 3, remaining: 0, depletedAt: dia(4) },
      { addedAt: dia(6), quantity: 2, remaining: 1 },
    ],
    1
  );

  assert.deepEqual(forma(lotes), ["3/0@1", "2/2@6"], "la última que abriste era del lote de junio");
  assert.equal(lotes.length, 2, "destildar 'probado' no es una compra");
});

test("devolver a un lote agotado le saca la marca de agotado", () => {
  const lotes = returnToLastOpenedLot([{ addedAt: dia(1), quantity: 3, remaining: 0, depletedAt: dia(4) }], 1);

  assert.deepEqual(forma(lotes), ["3/1@1"]);
  assert.equal(lotes[0].depletedAt, undefined, "ya no está agotado: la marca dejaría de ser cierta");
  assert.deepEqual(lotes[0].addedAt, dia(1), "el vino sigue en cava desde enero");
});

test("devolver a un vino sin lotes crea uno con la fecha de alta", () => {
  const lotes = returnToLastOpenedLot([], 1, { fallbackDate: dia(2) });
  assert.deepEqual(forma(lotes), ["1/1@2"]);
});

// --- Fijar un total exacto --------------------------------------------------

test("bajar la cantidad a mano descuenta FIFO", () => {
  const lotes = reconcileLots(
    [
      { addedAt: dia(1), quantity: 4, remaining: 4 },
      { addedAt: dia(6), quantity: 4, remaining: 4 },
    ],
    5
  );

  assert.equal(availableFromLots(lotes), 5);
  assert.deepEqual(forma(lotes), ["4/1@1", "4/4@6"]);
});

test("subir la cantidad a mano entra como lote nuevo", () => {
  const lotes = reconcileLots([{ addedAt: dia(1), quantity: 2, remaining: 2 }], 5, { addedAt: dia(6) });

  assert.equal(availableFromLots(lotes), 5);
  assert.deepEqual(forma(lotes), ["2/2@1", "3/3@6"]);
});

test("fijar la misma cantidad no mueve nada", () => {
  const original = [{ addedAt: dia(1), quantity: 3, remaining: 3 }];
  assert.deepEqual(reconcileLots(original, 3), original);
});

test("un vino viejo sin lotes conserva su antigüedad al ajustarle el stock", () => {
  const lotes = reconcileLots([], 8, { createdAt: dia(1), currentQuantity: 5, addedAt: dia(6) });

  assert.equal(availableFromLots(lotes), 8);
  assert.deepEqual(forma(lotes), ["5/5@1", "3/3@6"], "las 5 que ya tenías siguen siendo de enero");
});

// --- La invariante ----------------------------------------------------------

// `hydrate` arma el documento como sale de la base: sin caminos modificados,
// que es la única forma de distinguir "editaron quantity" de "editaron lotes".
const desdeLaBase = (attrs) =>
  Wine.hydrate({
    _id: "507f1f77bcf86cd799439012",
    userId: "507f1f77bcf86cd799439011",
    name: "Cabernet",
    createdAt: dia(1),
    ...attrs,
  });

test("quantity es la suma de lo que QUEDA, no de lo que entró", async () => {
  const vino = new Wine({
    userId: "507f1f77bcf86cd799439011",
    name: "Cabernet",
    quantity: 99, // mentira: los lotes mandan
    lots: [
      { addedAt: dia(1), quantity: 4, remaining: 0, depletedAt: dia(3) },
      { addedAt: dia(6), quantity: 3, remaining: 3 },
    ],
  });
  await vino.validate();

  assert.equal(vino.quantity, 3, "las 4 de enero ya te las tomaste");
  assert.equal(vino.lots.length, 2, "pero siguen en el historial");
});

test("editar quantity a mano acomoda los lotes en vez de desincronizarlos", async () => {
  const vino = desdeLaBase({
    quantity: 5,
    lots: [
      { addedAt: dia(1), quantity: 2, remaining: 2 },
      { addedAt: dia(6), quantity: 3, remaining: 3 },
    ],
  });

  vino.quantity = 3;
  await vino.validate();

  assert.equal(vino.quantity, 3);
  assert.equal(availableFromLots(vino.lots), 3, "los lotes siguen a quantity");
  assert.deepEqual(forma(vino.lots), ["2/0@1", "3/3@6"], "se vació primero el de enero");
});

test("un vino cargado antes de los lotes se arregla solo al guardarlo", async () => {
  const vino = desdeLaBase({ quantity: 4 });
  await vino.validate();

  assert.deepEqual(forma(vino.lots), ["4/4@1"], "sale del quantity que ya tenía");
  assert.equal(vino.quantity, 4, "el total que ve el usuario no se movió");
});

test("un vino agotado guarda su historial y queda en cero", async () => {
  const vino = desdeLaBase({
    quantity: 0,
    lots: [{ addedAt: dia(1), quantity: 6, remaining: 0, depletedAt: dia(5) }],
  });
  await vino.validate();

  assert.equal(vino.quantity, 0, "no queda nada");
  assert.equal(vino.lots.length, 1, "pero se sabe que hubo 6 botellas desde enero");
  assert.equal(entraron(vino.lots), 6);
});

test("un lote que nunca trajo nada no es historial: se descarta", async () => {
  const vino = new Wine({
    userId: "507f1f77bcf86cd799439011",
    name: "Syrah",
    lots: [
      { addedAt: dia(1), quantity: 0, remaining: 0 },
      { addedAt: dia(6), quantity: 2, remaining: 2 },
    ],
  });
  await vino.validate();

  assert.deepEqual(forma(vino.lots), ["2/2@6"]);
  assert.equal(vino.quantity, 2);
});

// --- Los mismos movimientos, dentro de Mongo --------------------------------

test("cada operación de stock termina recalculando quantity desde lo que queda", () => {
  for (const op of ["restock", "consume", "return", "set"]) {
    const stages = buildStockStages(op, { $literal: 1 });
    const json = JSON.stringify(stages);

    assert.equal(stages.length, 4, `${op}: normalizar, mover, sumar, status`);
    assert.ok(json.includes('"$$l.remaining"'), `${op}: el stock sale de remaining`);
    assert.ok(json.includes('"status"'), `${op}: el status se recalcula en el mismo paso`);
    assert.ok(!json.includes('"$filter"'), `${op}: ningún lote se descarta`);
  }

  assert.throws(() => buildStockStages("inventado", { $literal: 1 }), /desconocida/);
});
