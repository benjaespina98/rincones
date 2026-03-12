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

  connectPromise = mongoose.connect(mongoUri, {
    ...(databaseName ? { dbName: databaseName } : {}),
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
