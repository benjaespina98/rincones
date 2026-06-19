const dotenv = require("dotenv");
const path = require("path");
const app = require("./app");
const connectToDatabase = require("./config/db");
const validateEnvironment = require("./config/env");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    validateEnvironment();
    await connectToDatabase();

    app.listen(PORT, () => {
      console.log(`Servidor iniciado en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar el servidor:", error.message);
    process.exit(1);
  }
};

startServer();
