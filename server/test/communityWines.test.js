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

/**
 * Base en memoria con la misma superficie que usa el servicio.
 *
 * Indexada por `_id` y NO por `key`, igual que Mongo. La diferencia importa: el
 * servicio corrige la clave de una fila que nació con la vieja, y con un mapa
 * por clave eso dejaba la entrada anterior colgada y simulaba un duplicado que
 * en la base real no existe. El fake tiene que poder equivocarse en lo mismo que
 * se equivoca Mongo, no en otras cosas.
 */
const fakeDb = () => {
  const filas = new Map(); // _id → documento
  const originales = {
    findOne: CommunityWine.findOne,
    deleteOne: CommunityWine.deleteOne,
  };

  CommunityWine.findOne = async (q) => {
    for (const doc of filas.values()) if (doc.key === q.key) return doc;
    return null;
  };
  CommunityWine.deleteOne = async (q) => {
    filas.delete(q._id);
    return { deletedCount: 1 };
  };

  // `new CommunityWine({...})` construye un documento real de mongoose (aplica
  // defaults y enums, que es justo lo que queremos verificar); sólo se
  // intercepta el guardado.
  let siguiente = 1;
  const originalSave = CommunityWine.prototype.save;
  CommunityWine.prototype.save = async function save() {
    if (!this._id) this._id = `id-${siguiente++}`;
    filas.set(this._id, this);
    return this;
  };

  return {
    filas,
    get: (key) => [...filas.values()].find((d) => d.key === key),
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

/**
 * ── LA CLAVE NO PUEDE QUEDARSE VIEJA ────────────────────────────────────────
 * La clave incluye el varietal, pero los campos se completan después. Una fila
 * creada por una lectura que no leyó la uva nacía con la clave sin ella, y al
 * completarse `varietal` la clave no se recalculaba: quedaba describiendo algo
 * que la fila ya no era. La carga siguiente del MISMO vino calculaba la clave
 * con la uva, no encontraba nada, y creaba una segunda fila.
 *
 * Ese es el origen de los duplicados publicados en la búsqueda, y de que el pool
 * de fotos se partiera en dos mitades que no se ven entre sí.
 */
test("una carga que trae la uva adopta la fila que se creó sin ella, en vez de duplicarla", async () => {
  const db = fakeDb();
  try {
    // Primera lectura: no se leyó la uva.
    await communityWines.contribute(
      { name: "Familia Benito", winery: "Finca Bodega Familia Benito", type: "white" },
      { userId: u1, verdict: "unverified" }
    );
    const primera = soloFila(db);
    assert.equal(primera.key, "familia benito|finca bodega familia benito");

    // Segunda: la misma botella, ahora sí con la uva.
    await communityWines.contribute(
      {
        name: "Familia Benito",
        winery: "Finca Bodega Familia Benito",
        varietal: "Sauvignon Blanc",
        type: "white",
      },
      { userId: u2, verdict: "trusted" }
    );

    assert.equal(db.filas.size, 1, "es la misma botella: no puede haber dos filas");
    const fila = soloFila(db);
    assert.equal(
      fila.key,
      "familia benito sauvignon blanc|finca bodega familia benito",
      "la clave se corrige al adoptarla"
    );
    assert.equal(fila.varietal, "Sauvignon Blanc");
    assert.equal(fila.contributors.length, 2, "las dos contribuciones se conservan");
    assert.equal(fila.verified, true);
  } finally {
    db.restore();
  }
});

test("una uva distinta NO adopta la fila: es otro vino de la misma línea", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(
      { name: "Saint Felicien", winery: "Catena Zapata", varietal: "Malbec", type: "red" },
      { userId: u1, verdict: "trusted" }
    );
    await communityWines.contribute(
      {
        name: "Saint Felicien",
        winery: "Catena Zapata",
        varietal: "Cabernet Sauvignon",
        type: "red",
      },
      { userId: u2, verdict: "trusted" }
    );

    assert.equal(db.filas.size, 2, "el Malbec y el Cabernet son botellas distintas");
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

test("un nombre con marcas HTML, caracteres de control o un largo absurdo no se publica", async () => {
  const originalFindOne = CommunityWine.findOne;
  const originalSave = CommunityWine.prototype.save;
  const guardados = [];
  CommunityWine.findOne = () => Promise.resolve(null);
  CommunityWine.prototype.save = async function () {
    guardados.push(this);
    return this;
  };
  try {
    for (const name of ["<script>alert(1)</script>", "a".repeat(200), "Malbec\u0000raro"]) {
      await communityWines.contribute({ name, winery: "Bodega Real", varietal: "Malbec" }, { userId: "000000000000000000000001", verdict: "trusted" });
    }
    await communityWines.contribute({ name: "Reserva Especial", winery: "Bodega Real", varietal: "Malbec" }, { userId: "000000000000000000000001", verdict: "trusted" });
    const publicados = guardados.filter((d) => d.published).map((d) => d.name);
    assert.deepEqual(publicados, ["Reserva Especial"]);
  } finally {
    CommunityWine.findOne = originalFindOne;
    CommunityWine.prototype.save = originalSave;
  }
});
