const mongoose = require("mongoose");

let connectPromise = null;

const connectToDatabase = async () => {
  // 1 = connected, 2 = connecting, 0 = disconnected, 3 = disconnecting
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && connectPromise) {
    await connectPromise;
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;
  const databaseName = String(process.env.MONGODB_DB_NAME || "").trim();

  if (!mongoUri) {
    throw new Error("Falta la variable MONGODB_URI en el archivo .env");
  }

  /**
   * La base se declara SIEMPRE, y explotar acá es a propósito.
   *
   * Antes, si `MONGODB_DB_NAME` faltaba, no se pasaba `dbName` y Mongoose caía a
   * su base por defecto: "test". El problema es que "test" no es un nombre
   * neutro en este proyecto —es la base de desarrollo, con usuarios y vinos de
   * prueba adentro—. Así que una variable perdida en un deploy no rompía nada:
   * los usuarios REALES empezaban a registrarse mezclados con los ficticios, en
   * silencio, y sólo se descubriría al notar que faltan datos.
   *
   * Mezclar producción con desarrollo es peor que no arrancar, y mucho peor si
   * pasa sin avisar. Por eso el chequeo vive acá, en `connectToDatabase`, y no
   * en `config/env.js`: por acá pasan también los scripts de migración, que no
   * validan el entorno y son justo los que corren a mano y apurado.
   */
  if (!databaseName) {
    throw new Error(
      "Falta MONGODB_DB_NAME. Sin ese dato Mongoose usaría su base por defecto " +
        '("test"), que en este proyecto es la de desarrollo: producción escribiría ' +
        "encima de los datos de prueba sin que nada falle. Definila antes de " +
        "conectar (producción: rincones · local: test)."
    );
  }

  connectPromise = mongoose.connect(mongoUri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  try {
    await connectPromise;
    const activeDbName = mongoose.connection?.name || databaseName || "(default)";
    console.log(`MongoDB conectado (${activeDbName})`);
  } catch (error) {
    connectPromise = null;
    throw error;
  }

  return mongoose.connection;
};

module.exports = connectToDatabase;
