const mongoose = require("mongoose");

let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Falta la variable MONGODB_URI en el archivo .env");
  }

  await mongoose.connect(mongoUri);
  isConnected = true;
  console.log("MongoDB conectado");

  return mongoose.connection;
};

module.exports = connectToDatabase;
