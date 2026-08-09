const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const CommunityWine = require("../src/models/communityWine.model");
const communityWines = require("../src/services/communityWines.service");

// Ids reales y no strings: `contributors` es un array de ObjectId, y con strings
// inventados mongoose descarta el valor en silencio — la prueba pasaría a estar
// midiendo el casteo en vez de la regla de publicación.
const u1 = new mongoose.Types.ObjectId();
const u2 = new mongoose.Types.ObjectId();

/**
 * Quién entra al catálogo público y cuándo.
 *
 * Es la parte del sistema donde un error deja de ser privado: lo que se publica
 * acá lo busca cualquier otra persona.
 *
 * ── LO QUE ESTAS PRUEBAS SOSTIENEN ──────────────────────────────────────────
 * Hubo una versión que pedía DOS personas distintas para publicar. La defensa
 * estaba bien pensada y puesta en el lugar equivocado: bloqueaba la EXISTENCIA
 * en vez de la AUTORIDAD, y con un solo usuario esa segunda persona no llegaba
 * nunca. El efecto real era que ningún vino cargado aparecía jamás en la
 * búsqueda, ni con su foto.
 *
 * Ahora son dos preguntas separadas, y cada una tiene sus pruebas acá:
 *
 *   published — ¿existe para los demás? Sí apenas la identidad alcanza para
 *               nombrar una botella. No mira la confianza de la lectura.
 *   verified  — ¿tiene autoridad? Dos personas distintas y una lectura buena.
 *               Es lo único que rankea por encima del modelo, y es donde sigue
 *               viviendo toda la exigencia.
 */

/** Base en memoria con la misma superficie que usa el servicio. */
const fakeDb = () => {
  const filas = new Map();
  const originales = {
    findOne: CommunityWine.findOne,
    deleteOne: CommunityWine.deleteOne,
  };

  CommunityWine.findOne = async (q) => filas.get(q.key) || null;
  CommunityWine.deleteOne = async (q) => {
    for (const [k, v] of filas) if (v._id === q._id) filas.delete(k);
    return { deletedCount: 1 };
  };

  // `new CommunityWine({...})` construye un documento real de mongoose (aplica
  // defaults y enums, que es justo lo que queremos verificar); sólo se
  // intercepta el guardado.
  const originalSave = CommunityWine.prototype.save;
  CommunityWine.prototype.save = async function save() {
    if (!this._id) this._id = `id-${filas.size + 1}`;
    filas.set(this.key, this);
    return this;
  };

  return {
    filas,
    get: (key) => filas.get(key),
    restore: () => {
      CommunityWine.findOne = originales.findOne;
      CommunityWine.deleteOne = originales.deleteOne;
      CommunityWine.prototype.save = originalSave;
    },
  };
};

const PISPI = {
  name: "Pispi",
  winery: "Mosquita Muerta",
  varietal: "Blend",
  region: "Valle de Uco, Mendoza",
  type: "red",
};

const soloFila = (db) => [...db.filas.values()][0];

test("una lectura confiable publica en el acto", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });

    const fila = soloFila(db);
    assert.ok(fila, "tiene que haberse creado la fila");
    assert.equal(fila.published, true, "una lectura buena no tiene que esperar a nadie");
    assert.equal(fila.verified, false, "pero todavía no está confirmada por otro");
    assert.equal(fila.trustedCount, 1);
  } finally {
    db.restore();
  }
});

test("una lectura floja también publica: la confianza no decide si el vino existe", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });

    const fila = soloFila(db);
    assert.equal(fila.published, true, "el vino es el mismo, se haya leído con 90 o con 55");
    assert.equal(fila.verified, false, "lo que NO tiene es autoridad para rankear arriba");
    assert.equal(fila.trustedCount, 0);
    assert.equal(fila.contributors.length, 1);
  } finally {
    db.restore();
  }
});

test("una identificación dudosa entra igual, mientras la identidad cierre", async () => {
  const db = fakeDb();
  try {
    // "doubtful" quiere decir que la FOTO salió mal, no que el vino no exista.
    // Si el nombre y la bodega están, hay una botella que nombrar.
    await communityWines.contribute(PISPI, { userId: u1, verdict: "doubtful" });

    const fila = soloFila(db);
    assert.ok(fila, "antes esto no escribía nada y el vino se perdía para todos");
    assert.equal(fila.published, true);
    assert.equal(fila.trustedCount, 0, "pero no cuenta como lectura buena");
  } finally {
    db.restore();
  }
});

test("una segunda persona con lo mismo es lo que verifica", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });
    assert.equal(soloFila(db).verified, false, "una sola persona no confirma nada");

    await communityWines.contribute(PISPI, { userId: u2, verdict: "trusted" });

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 2);
    assert.equal(fila.verified, true, "dos personas distintas y una lectura buena");
  } finally {
    db.restore();
  }
});

test("la MISMA persona cargando dos veces no verifica nada", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 1, "es una sola persona, por más veces que cargue");
    assert.equal(fila.verified, false, "si leyó mal la primera vez, va a leer mal la segunda");
    assert.equal(fila.count, 2, "el total de cargas sí sube");
  } finally {
    db.restore();
  }
});

test("una carga que contradice a la que había no cuenta como confirmación", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });
    // Mismo vino (misma clave) pero otra región: alguno de los dos se equivocó,
    // y coincidir es justamente lo que hace valiosa a la segunda carga.
    await communityWines.contribute(
      { ...PISPI, region: "Cafayate, Salta" },
      { userId: u2, verdict: "trusted" }
    );

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 1, "el que contradice no suma como confirmación");
    assert.equal(fila.verified, false, "y sin dos personas no hay autoridad");
    assert.equal(fila.published, true, "el vino sigue existiendo: la duda es sobre la región");
  } finally {
    db.restore();
  }
});

test("sin bodega no se publica nada", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(
      { ...PISPI, winery: "" },
      { userId: u1, verdict: "trusted" }
    );
    assert.equal(db.filas.size, 0, "media identidad no alcanza para un catálogo compartido");
  } finally {
    db.restore();
  }
});

/**
 * ── EL CASO "PISPI" ─────────────────────────────────────────────────────────
 * El nombre de fantasía va grande en la etiqueta y la bodega chica abajo, así
 * que el modelo lee el mismo texto para los dos campos. Una fila con nombre =
 * bodega no identifica ninguna botella… salvo que sea cierto, que pasa seguido.
 */
test("nombre igual a la bodega: entra anotado, pero no se publica", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(
      { ...PISPI, name: "Pispi", winery: "Pispi" },
      { userId: u1, verdict: "trusted" }
    );

    const fila = soloFila(db);
    assert.ok(fila, "la fila queda: si su autor la corrige, `retract` tiene qué sacar");
    assert.equal(fila.published, false, "sabemos que uno de los dos campos está mal, no cuál");
  } finally {
    db.restore();
  }
});

test("nombre igual a la bodega, confirmado por la persona: se publica", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(
      { ...PISPI, name: "Pispi", winery: "Pispi" },
      { userId: u1, verdict: "trusted", sameNameConfirmed: true }
    );

    const fila = soloFila(db);
    assert.equal(fila.sameNameOk, true);
    assert.equal(fila.published, true, "nadie confirma eso por accidente");
  } finally {
    db.restore();
  }
});

test("nombre igual a la bodega, respaldado por el catálogo curado: se publica solo", async () => {
  const db = fakeDb();
  try {
    // Norton, El Enemigo, Achaval Ferrer, Durigutti, Chandon: el catálogo tiene
    // 25 filas así. A esas no hay nada que preguntarles.
    await communityWines.contribute(
      { name: "Norton", winery: "Norton", varietal: "Malbec", type: "red" },
      { userId: u1, verdict: "unverified" }
    );

    const fila = soloFila(db);
    assert.equal(fila.published, true, "no es un error: el vino se llama así");
  } finally {
    db.restore();
  }
});

test("la confirmación sólo suma: una carga posterior sin ella no la desmiente", async () => {
  const db = fakeDb();
  try {
    const igual = { ...PISPI, name: "Pispi", winery: "Pispi" };
    await communityWines.contribute(igual, { userId: u1, verdict: "trusted", sameNameConfirmed: true });
    await communityWines.contribute(igual, { userId: u2, verdict: "unverified" });

    const fila = soloFila(db);
    assert.equal(fila.sameNameOk, true, "que el segundo no lo repita no lo vuelve falso");
    assert.equal(fila.published, true);
  } finally {
    db.restore();
  }
});

test("retirar la única contribución borra la fila", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });
    await communityWines.retract(PISPI, { userId: u1, wasTrusted: true });

    assert.equal(db.filas.size, 0, "nadie la sostiene: la fila era de esa persona y se equivocó");
  } finally {
    db.restore();
  }
});

test("retirar una de dos contribuciones desverifica pero no borra ni despublica", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "trusted" });
    await communityWines.contribute(PISPI, { userId: u2, verdict: "unverified" });
    assert.equal(soloFila(db).verified, true);

    // El que la había leído bien se da cuenta de que estaba mal y la corrige.
    await communityWines.retract(PISPI, { userId: u1, wasTrusted: true });

    const fila = soloFila(db);
    assert.ok(fila, "sigue existiendo: todavía queda alguien que la cargó");
    assert.equal(fila.contributors.length, 1);
    assert.equal(fila.verified, false, "pierde la autoridad, que es lo que se apoyaba en los dos");
    assert.equal(fila.published, true, "pero no la existencia: la identidad no cambió");
  } finally {
    db.restore();
  }
});
