const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Producción y desarrollo no pueden terminar en la misma base por una variable
 * de entorno que faltó.
 *
 * El escenario que esto previene: `MONGODB_DB_NAME` se pierde en un deploy,
 * Mongoose cae a su base por defecto ("test") y los usuarios REALES empiezan a
 * registrarse mezclados con los de prueba. Sin error, sin log raro, sin nada:
 * sólo datos entreverados que se descubren mucho después.
 *
 * En este proyecto "test" no es un nombre neutro —es la base de desarrollo—, así
 * que el default de Mongoose es exactamente el peor destino posible.
 */

const conVariables = async (vars, fn) => {
  const previas = {};
  for (const [k, v] of Object.entries(vars)) {
    previas[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(previas)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

/** El módulo lee el entorno al conectar, pero cachea la conexión: se recarga. */
const cargarConectar = () => {
  delete require.cache[require.resolve("../src/config/db")];
  return require("../src/config/db");
};

test("sin MONGODB_DB_NAME no se conecta: falla y lo dice", async () => {
  await conVariables(
    { MONGODB_URI: "mongodb://127.0.0.1:27017", MONGODB_DB_NAME: undefined },
    async () => {
      const connect = cargarConectar();
      await assert.rejects(
        () => connect(),
        (err) => {
          assert.match(err.message, /MONGODB_DB_NAME/);
          // El mensaje tiene que explicar POR QUÉ importa, no sólo qué falta:
          // quien lo lee a las 2am necesita entender el riesgo, no buscarlo.
          assert.match(err.message, /test/);
          return true;
        },
        "faltando la base, conectar tiene que explotar antes de escribir nada"
      );
    }
  );
});

test("con la variable vacía o en blanco tampoco pasa", async () => {
  for (const valor of ["", "   "]) {
    await conVariables(
      { MONGODB_URI: "mongodb://127.0.0.1:27017", MONGODB_DB_NAME: valor },
      async () => {
        const connect = cargarConectar();
        await assert.rejects(() => connect(), /MONGODB_DB_NAME/);
      }
    );
  }
});

test("sin MONGODB_URI sigue fallando por su lado", async () => {
  await conVariables({ MONGODB_URI: undefined, MONGODB_DB_NAME: "rincones" }, async () => {
    const connect = cargarConectar();
    await assert.rejects(() => connect(), /MONGODB_URI/);
  });
});
