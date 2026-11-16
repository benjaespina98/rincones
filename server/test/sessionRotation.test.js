const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const RefreshToken = require("../src/models/refreshToken.model");
const sessions = require("../src/services/session.service");

/**
 * La rotación del refresh, y la diferencia entre una respuesta perdida y un robo.
 *
 * Antes esto era un `findOneAndDelete`: el token viejo desaparecía en el mismo
 * momento en que se lo canjeaba. Correcto en el caso feliz y fatal en el otro —
 * si la respuesta no llegaba (red que se corta, arranque en frío que se pasa del
 * timeout del cliente), el token viejo ya no existía y el nuevo se había
 * perdido: la sesión moría sin que nadie hubiera hecho nada mal. Es la causa del
 * "a veces me manda al login".
 *
 * Arreglarlo no puede costar la detección de reuso, que es lo que hace que un
 * token robado no sirva para siempre. Estas dos cosas son las que se prueban acá,
 * y son la misma prueba mirada desde los dos lados.
 */

const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

/** Colección de refresh tokens en memoria, con la superficie que usa el servicio. */
const fakeStore = () => {
  const docs = [];
  const originales = {
    findOne: RefreshToken.findOne,
    create: RefreshToken.create,
    deleteOne: RefreshToken.deleteOne,
    deleteMany: RefreshToken.deleteMany,
  };

  RefreshToken.findOne = async (q) => docs.find((d) => d.tokenHash === q.tokenHash) || null;
  RefreshToken.create = async (data) => {
    const doc = {
      ...data,
      _id: new mongoose.Types.ObjectId(),
      save: async function save() {
        return this;
      },
    };
    docs.push(doc);
    return doc;
  };
  RefreshToken.deleteOne = async (q) => {
    const i = docs.findIndex((d) => String(d._id) === String(q._id));
    if (i >= 0) docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  };
  RefreshToken.deleteMany = async (q) => {
    const antes = docs.length;
    for (let i = docs.length - 1; i >= 0; i -= 1) {
      if (String(docs[i].userId) === String(q.userId)) docs.splice(i, 1);
    }
    return { deletedCount: antes - docs.length };
  };

  return {
    docs,
    vivos: () => docs.length,
    restore: () => Object.assign(RefreshToken, originales),
  };
};

const USER = new mongoose.Types.ObjectId();

test("el canje normal entrega un token nuevo y deja encadenado al viejo", async () => {
  const store = fakeStore();
  try {
    const { token: a } = await sessions.issueRefreshToken(USER);
    const rotado = await sessions.rotateRefreshToken(a);

    assert.ok(rotado?.token, "tiene que devolver un token usable");
    assert.notEqual(rotado.token, a, "y tiene que ser otro: rotar es cambiarlo");
    assert.equal(String(rotado.userId), String(USER));

    const viejo = store.docs.find((d) => d.tokenHash === hash(a));
    assert.ok(viejo, "el viejo NO se borra: es lo que permite reconocer un reintento");
    assert.ok(viejo.usedAt, "queda marcado como usado");
    assert.equal(viejo.replacedByHash, hash(rotado.token), "y apuntando a su reemplazo");
  } finally {
    store.restore();
  }
});

test("si la respuesta se perdió, reintentar con el mismo token NO mata la sesión", async () => {
  const store = fakeStore();
  try {
    const { token: a } = await sessions.issueRefreshToken(USER);

    // Primer canje: el server rota, pero la respuesta nunca llega al cliente
    // (se cortó la red / axios abortó por timeout). El cliente sigue con `a`.
    const perdido = await sessions.rotateRefreshToken(a);
    assert.ok(perdido?.token);

    // El cliente reintenta con lo único que tiene.
    const segundo = await sessions.rotateRefreshToken(a);

    assert.ok(segundo?.token, "la sesión tiene que sobrevivir: nadie hizo nada mal");
    assert.ok(!segundo.reused, "esto no es un reuso, es un reintento");
    assert.notEqual(segundo.token, perdido.token, "y el huérfano no se reparte dos veces");

    // El sucesor que nadie recibió se descarta, no queda dando vueltas.
    const huerfano = store.docs.find((d) => d.tokenHash === hash(perdido.token));
    assert.equal(huerfano, undefined, "un token que nadie recibió no puede quedar válido");
  } finally {
    store.restore();
  }
});

test("el esquema declara graceCount: sin eso Mongoose lo descarta y el tope no persiste", () => {
  const campo = RefreshToken.schema.path("graceCount");
  assert.ok(campo, "graceCount tiene que estar en el esquema");
  assert.equal(RefreshToken.schema.path("graceCount").options.default, 0);
});

test("re-canjear el MISMO token usado más de 3 veces es abuso y corta todas las sesiones", async () => {
  const store = fakeStore();
  try {
    const { token: a } = await sessions.issueRefreshToken(USER);
    await sessions.rotateRefreshToken(a); // canje normal

    // Tres reintentos con el mismo token se toleran (respuestas perdidas).
    for (let i = 0; i < 3; i += 1) {
      const r = await sessions.rotateRefreshToken(a);
      assert.ok(r?.token && !r.reused, `el reintento ${i + 1} tiene que pasar`);
    }

    // El siguiente ya no es red mala: se cierra todo.
    const cuarto = await sessions.rotateRefreshToken(a);
    assert.equal(cuarto?.reused, true);
    assert.equal(store.vivos(), 0, "no queda ninguna sesión del usuario");
  } finally {
    store.restore();
  }
});

test("reusar un token cuyo reemplazo YA circuló es robo, y corta todo", async () => {
  const store = fakeStore();
  try {
    const { token: a } = await sessions.issueRefreshToken(USER);

    // El dueño legítimo canjea y sigue con el nuevo.
    const b = await sessions.rotateRefreshToken(a);
    const c = await sessions.rotateRefreshToken(b.token);
    assert.ok(c?.token, "el dueño sigue andando");

    // Alguien más aparece con el token viejo, que tenía copiado.
    const atacante = await sessions.rotateRefreshToken(a);

    assert.equal(atacante?.reused, true, "el reuso tiene que seguir detectándose");
    assert.equal(atacante.token, undefined, "y no puede entregar una sesión");
    assert.equal(
      store.vivos(),
      0,
      "se cierran TODAS las sesiones del usuario, también la del dueño: si alguien " +
        "tiene un token copiado, el momento de echarlo es este"
    );
  } finally {
    store.restore();
  }
});

test("un token que no existe no es un reuso, es una sesión desconocida", async () => {
  const store = fakeStore();
  try {
    const resultado = await sessions.rotateRefreshToken("no-existe");
    assert.equal(resultado, null);
  } finally {
    store.restore();
  }
});

test("un token vencido no sirve y se limpia", async () => {
  const store = fakeStore();
  try {
    const { token } = await sessions.issueRefreshToken(USER);
    const doc = store.docs.find((d) => d.tokenHash === hash(token));
    doc.expiresAt = new Date(Date.now() - 1000);

    assert.equal(await sessions.rotateRefreshToken(token), null);
    assert.equal(store.vivos(), 0, "no queda basura vencida en la colección");
  } finally {
    store.restore();
  }
});

test("cerrar sesión sigue matando el token en la base", async () => {
  const store = fakeStore();
  try {
    const { token } = await sessions.issueRefreshToken(USER);
    RefreshToken.deleteOne = async (q) => {
      const i = store.docs.findIndex((d) => d.tokenHash === q.tokenHash);
      if (i >= 0) store.docs.splice(i, 1);
      return { deletedCount: 1 };
    };

    await sessions.revokeRefreshToken(token);
    assert.equal(store.vivos(), 0);
  } finally {
    store.restore();
  }
});
