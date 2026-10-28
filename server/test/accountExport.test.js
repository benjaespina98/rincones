const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { limpiar } = require("../src/services/accountExport.service");

/**
 * Llevarse los datos propios, y que lo que se lleva coincida con lo que se
 * borra.
 *
 * ── EL TEST QUE IMPORTA ES EL PRIMERO ───────────────────────────────────────
 * Exportar y dar de baja leen el mismo inventario de colecciones, y están
 * escritos en dos archivos distintos. En cuanto alguien agregue una colección
 * nueva —como pasó con las conversaciones del Sommelier, que se agregaron al
 * export y se habían olvidado del borrado— las dos listas se separan en
 * silencio, y las dos formas de separarse son malas:
 *
 *   se borra y no se exporta  →  alguien pierde algo sin enterarse
 *   se exporta y no se borra  →  queda un dato que se prometió eliminar
 *
 * Por eso se comparan leyendo los dos archivos, y no mockeando: lo que se
 * quiere detectar es justamente que un archivo cambió y el otro no.
 */

const leer = (relativo) =>
  fs.readFileSync(path.resolve(__dirname, "..", "src", "services", relativo), "utf8");

/** Los modelos que un archivo importa de `../models/`. */
const modelosDe = (fuente) =>
  new Set([...fuente.matchAll(/require\("\.\.\/models\/([a-zA-Z]+)\.model"\)/g)].map((m) => m[1]));

test("exportar y borrar miran el MISMO inventario de datos personales", () => {
  const exportar = modelosDe(leer("accountExport.service.js"));
  const borrar = modelosDe(leer("accountDeletion.service.js"));

  /**
   * Las tres diferencias legítimas, cada una con su razón:
   *
   *   user            las dos lo usan, pero el export lo lee y el borrado lo
   *                   elimina — está en los dos, no hace falta excepción.
   *   refreshToken    sesiones abiertas. Se borran; exportarlas sería entregar
   *                   credenciales en un archivo.
   *   analyticsEvent  telemetría que nadie pidió generar. Se borra; exportarla
   *                   sería devolverle a la persona un registro de vigilancia
   *                   de sí misma con forma de regalo.
   */
  const soloSeBorran = new Set(["refreshToken", "analyticsEvent"]);
  /** El precio pagado vive dentro del vino; `winePrice` es el histórico anónimo. */
  const soloSeBorranTambien = new Set(["winePrice", "wineImage"]);

  const faltanEnElExport = [...borrar].filter(
    (m) => !exportar.has(m) && !soloSeBorran.has(m) && !soloSeBorranTambien.has(m)
  );
  const faltanEnElBorrado = [...exportar].filter((m) => !borrar.has(m));

  assert.deepEqual(
    faltanEnElExport,
    [],
    `Estas colecciones se borran pero no se exportan: ${faltanEnElExport.join(", ")}. ` +
      "Alguien va a perder esos datos sin enterarse."
  );
  assert.deepEqual(
    faltanEnElBorrado,
    [],
    `Estas colecciones se exportan pero NO se borran con la cuenta: ${faltanEnElBorrado.join(", ")}. ` +
      "Son datos que se prometió eliminar y quedan."
  );
});

test("las conversaciones del Sommelier están en los dos lados", () => {
  // Explícito y aparte del test general: es el caso que ya falló una vez.
  assert.ok(modelosDe(leer("accountExport.service.js")).has("sommelierConversation"));
  assert.ok(modelosDe(leer("accountDeletion.service.js")).has("sommelierConversation"));
});

test("el export nunca incluye la contraseña ni los tokens de recuperación", () => {
  const fuente = leer("accountExport.service.js");
  // El `select` es negativo: lo que importa es que esos cuatro estén listados.
  for (const campo of [
    "-passwordHash",
    "-resetPasswordToken",
    "-resetPasswordExpires",
    "-emailVerificationToken",
  ]) {
    assert.ok(fuente.includes(campo), `falta excluir ${campo} del export`);
  }
});

test("limpiar saca los campos internos y deja el resto", () => {
  const salida = limpiar({
    _id: "w1",
    name: "Catena Alta",
    quantity: 3,
    __v: 7,
    userId: "u1",
  });

  // `__v` y `userId` no significan nada fuera de la base; el id sí sirve para
  // cruzar un vino con sus momentos dentro del mismo archivo.
  assert.deepEqual(salida, { _id: "w1", name: "Catena Alta", quantity: 3 });
});

test("limpiar también saca `user`, que es como lo llama WinePrice", () => {
  // Las colecciones no usan todas el mismo nombre para la referencia al dueño.
  assert.deepEqual(limpiar({ _id: "p1", price: 100, user: "u1" }), { _id: "p1", price: 100 });
});
