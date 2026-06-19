const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const connectToDatabase = require("../src/config/db");
const User = require("../src/models/user.model");

dotenv.config();

const run = async () => {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "").trim();

  if (!email || !password) {
    console.error("Faltan ADMIN_EMAIL o ADMIN_PASSWORD en .env");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD debe tener al menos 8 caracteres");
    process.exit(1);
  }

  try {
    await connectToDatabase();
    const passwordHash = await bcrypt.hash(password, 10);

    await User.findOneAndUpdate(
      { email },
      { email, passwordHash, role: "admin" },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    console.log("Admin creado/actualizado correctamente");
    process.exit(0);
  } catch (error) {
    console.error("Error al crear admin:", error.message);
    process.exit(1);
  }
};

run();
