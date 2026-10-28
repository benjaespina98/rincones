// Marca como verificada una cuenta descartable de los tests E2E (e2e_*@example.test),
// para poder recorrer la app sin pasar por el mail. Se niega a tocar cualquier otra
// cuenta o cualquier base que no sea `test`.
//
//   node scripts/verificarE2E.js e2e_ui_ab12cd34@example.test
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const email = String(process.argv[2] || "").trim().toLowerCase();

(async () => {
  if (process.env.MONGODB_DB_NAME !== "test") {
    console.error("Me niego: MONGODB_DB_NAME no es 'test'.");
    process.exit(1);
  }
  if (!/^e2e_[a-z0-9]+_[a-z0-9]+@example\.test$/.test(email)) {
    console.error("Me niego: sólo cuentas e2e_*@example.test.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test" });
  const r = await mongoose.connection.db
    .collection("users")
    .updateOne({ email }, { $set: { emailVerified: true } });
  console.log(r.matchedCount ? "verificada" : "no existe");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
