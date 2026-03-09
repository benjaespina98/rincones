const dotenv = require("dotenv");
const app = require("../src/app");
const connectToDatabase = require("../src/config/db");

dotenv.config();

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    return res.status(500).json({
      message: "Error al conectar con la base de datos",
      details: error.message,
    });
  }
};
