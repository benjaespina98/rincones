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
 * acá lo busca cualquier otra persona, y hasta hace poco alcanzaba UNA carga de
 * UNA persona —con cualquier confianza— para que un vino apareciera en las
 * búsquedas de todos, ranqueado por encima del modelo.
 *
 * El umbral es intermedio a propósito: rápido cuando la lectura es buena,
 * paciente cuando no lo es. Estas pruebas son las que sostienen esa diferencia.
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

test("una lectura intermedia NO publica: queda esperando confirmación", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });

    const fila = soloFila(db);
    assert.ok(fila, "la fila se crea igual: es lo que permite que otro la confirme");
    assert.equal(fila.published, false, "no puede aparecer en la búsqueda de nadie");
    assert.equal(fila.contributors.length, 1);
  } finally {
    db.restore();
  }
});

test("una identificación dudosa no toca el catálogo", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "doubtful" });
    assert.equal(db.filas.size, 0, "no se escribe nada, ni siquiera sin publicar");
  } finally {
    db.restore();
  }
});

test("una segunda persona con lo mismo publica y verifica", async () => {
  const db = fakeDb();
  try {
    // Dos lecturas flojas, pero independientes y coincidentes: juntas valen.
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });
    assert.equal(soloFila(db).published, false);

    await communityWines.contribute(PISPI, { userId: u2, verdict: "trusted" });

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 2);
    assert.equal(fila.published, true);
    assert.equal(fila.verified, true, "dos personas distintas y una lectura buena");
  } finally {
    db.restore();
  }
});

test("la MISMA persona cargando dos veces no confirma nada", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 1, "es una sola persona, por más veces que cargue");
    assert.equal(fila.published, false, "si leyó mal la primera vez, va a leer mal la segunda");
    assert.equal(fila.count, 2, "el total de cargas sí sube");
  } finally {
    db.restore();
  }
});

test("una carga que contradice a la que había no cuenta como confirmación", async () => {
  const db = fakeDb();
  try {
    await communityWines.contribute(PISPI, { userId: u1, verdict: "unverified" });
    // Mismo vino (misma clave) pero otra región: alguno de los dos se equivocó,
    // y coincidir es justamente lo que hace valiosa a la segunda carga.
    await communityWines.contribute(
      { ...PISPI, region: "Cafayate, Salta" },
      { userId: u2, verdict: "unverified" }
    );

    const fila = soloFila(db);
    assert.equal(fila.contributors.length, 1, "el que contradice no suma como confirmación");
    assert.equal(fila.published, false);
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

test("retirar una de dos contribuciones despublica pero no borra", async () => {
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
    assert.equal(fila.verified, false);
    assert.equal(fila.published, false, "vuelve a esperar confirmación");
  } finally {
    db.restore();
  }
});
