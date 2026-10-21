const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const WineImage = require("../src/models/wineImage.model");
const wineImages = require("../src/services/wineImages.service");
const wineImageQuality = require("../src/services/wineImageQuality.service");

const dueño = new mongoose.Types.ObjectId();
const otra = new mongoose.Types.ObjectId();

/**
 * Quién manda en la foto pública de un vino.
 *
 * ── LO QUE ESTAS PRUEBAS SOSTIENEN ──────────────────────────────────────────
 * Antes, la primera foto que llegaba quedaba fija para siempre y sólo su
 * propio autor la podía reemplazar — sin importar si era una foto borrosa, de
 * otra cosa, o si alguien después subía una mejor. Ahora hay un puntaje
 * (Gemini, vía wineImageQuality.service.js) que decide dos cosas separadas:
 * si la foto entra siquiera (¿es un vino?) y si una foto nueva puede
 * desplazar a la puesta (¿es claramente mejor?).
 *
 * `wineImageQuality.scorePhoto` se reemplaza por una función de prueba en
 * cada caso — mismo patrón que el resto de esta suite usa para
 * `wineImages.contribute` (ver wineIdentification.test.js): no se golpea la
 * red ni se depende de que Gemini esté configurado.
 */

const fakeDb = () => {
  const filas = new Map(); // key → documento

  const original = {
    findOne: WineImage.findOne,
    updateOne: WineImage.updateOne,
  };

  WineImage.findOne = (filtro) => ({
    select: () => ({
      lean: async () => {
        const fila = filas.get(filtro.key);
        return fila ? { ...fila } : null;
      },
    }),
  });

  WineImage.updateOne = async (filtro, update) => {
    if (update.$setOnInsert) {
      if (!filas.has(filtro.key)) filas.set(filtro.key, { ...update.$setOnInsert });
      return;
    }
    const fila = filas.get(filtro.key);
    if (fila) Object.assign(fila, update.$set);
  };

  return {
    filas,
    restore: () => {
      WineImage.findOne = original.findOne;
      WineImage.updateOne = original.updateOne;
    },
  };
};

const conScore = (respuesta) => {
  const original = wineImageQuality.scorePhoto;
  wineImageQuality.scorePhoto = async () => respuesta;
  return () => {
    wineImageQuality.scorePhoto = original;
  };
};

const vino = { name: "Malbec Reserva", winery: "Bodega X", varietal: "Malbec" };
const fotoA = "data:image/png;base64,foto-a";
const fotoB = "data:image/png;base64,foto-b";

test("sin puntaje (Gemini no configurado): la primera foto entra y sólo el dueño la reemplaza", async () => {
  const db = fakeDb();
  const restoreScore = conScore(null);
  try {
    await wineImages.contribute({ ...vino, image: fotoA, userId: dueño });
    assert.equal(db.filas.get(wineImages.wineKey(vino.name, vino.winery, vino.varietal)).image, fotoA);

    // Otra persona no puede reemplazarla sin puntaje que lo respalde.
    await wineImages.contribute({ ...vino, image: fotoB, userId: otra });
    assert.equal(db.filas.get(wineImages.wineKey(vino.name, vino.winery, vino.varietal)).image, fotoA);

    // El dueño sí, como siempre.
    await wineImages.contribute({ ...vino, image: fotoB, userId: dueño });
    assert.equal(db.filas.get(wineImages.wineKey(vino.name, vino.winery, vino.varietal)).image, fotoB);
  } finally {
    restoreScore();
    db.restore();
  }
});

test("una foto que Gemini reconoce como 'no es un vino' nunca entra al pool", async () => {
  const db = fakeDb();
  const restoreScore = conScore({ isWinePhoto: false, quality: 0 });
  try {
    await wineImages.contribute({ ...vino, image: fotoA, userId: dueño });
    assert.equal(db.filas.size, 0, "no se crea entrada para una foto que no es de un vino");
  } finally {
    restoreScore();
    db.restore();
  }
});

test("el gate bloquea incluso al dueño de la foto actual", async () => {
  const db = fakeDb();
  const key = wineImages.wineKey(vino.name, vino.winery, vino.varietal);
  db.filas.set(key, { image: fotoA, contributedBy: String(dueño), qualityScore: 70 });
  const restoreScore = conScore({ isWinePhoto: false, quality: 0 });
  try {
    await wineImages.contribute({ ...vino, image: fotoB, userId: dueño });
    assert.equal(db.filas.get(key).image, fotoA, "la foto puesta no se pisa con algo que no es un vino");
  } finally {
    restoreScore();
    db.restore();
  }
});

test("una foto de otra persona con puntaje claramente mejor desplaza a la puesta", async () => {
  const db = fakeDb();
  const key = wineImages.wineKey(vino.name, vino.winery, vino.varietal);
  db.filas.set(key, { image: fotoA, contributedBy: String(dueño), qualityScore: 60 });
  const restoreScore = conScore({ isWinePhoto: true, quality: 90 });
  try {
    await wineImages.contribute({ ...vino, image: fotoB, userId: otra });
    const fila = db.filas.get(key);
    assert.equal(fila.image, fotoB);
    assert.equal(fila.qualityScore, 90);
    assert.equal(String(fila.contributedBy), String(otra), "la atribución pasa a quien aportó la mejor foto");
  } finally {
    restoreScore();
    db.restore();
  }
});

test("una foto de otra persona con puntaje apenas mejor (dentro del margen) NO desplaza", async () => {
  const db = fakeDb();
  const key = wineImages.wineKey(vino.name, vino.winery, vino.varietal);
  db.filas.set(key, { image: fotoA, contributedBy: String(dueño), qualityScore: 60 });
  const restoreScore = conScore({ isWinePhoto: true, quality: 65 }); // +5, margen es 8
  try {
    await wineImages.contribute({ ...vino, image: fotoB, userId: otra });
    const fila = db.filas.get(key);
    assert.equal(fila.image, fotoA, "una mejora chica no alcanza para pisar la foto de otro");
    assert.equal(fila.qualityScore, 60);
  } finally {
    restoreScore();
    db.restore();
  }
});

test("una foto vieja sin puntaje cuenta como piso: cualquier foto nueva bien puntuada la reemplaza", async () => {
  const db = fakeDb();
  const key = wineImages.wineKey(vino.name, vino.winery, vino.varietal);
  // Simula una entrada de antes de que existiera el puntaje: sin qualityScore.
  db.filas.set(key, { image: fotoA, contributedBy: String(dueño) });
  const restoreScore = conScore({ isWinePhoto: true, quality: 40 });
  try {
    await wineImages.contribute({ ...vino, image: fotoB, userId: otra });
    const fila = db.filas.get(key);
    assert.equal(fila.image, fotoB, "el pool se cura solo: una foto puntuada desplaza a una sin evaluar");
    assert.equal(fila.qualityScore, 40);
  } finally {
    restoreScore();
    db.restore();
  }
});
