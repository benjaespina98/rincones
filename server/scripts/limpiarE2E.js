// Borra SÓLO los usuarios descartables que crean los tests E2E (e2e_*@example.test)
// y lo que tengan, en la base `test`. Se niega a correr contra cualquier otra
// base: la `rincones` es producción.
//
//   npm run e2e:limpiar -w server
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const COLECCIONES = [
  "wines", "winemoments", "winewishes", "winereviews", "refreshtokens", "analyticsevents",
  "sommelierconversations",
];

(async () => {
  if (process.env.MONGODB_DB_NAME !== "test") {
    console.error("Me niego: MONGODB_DB_NAME no es 'test'.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test" });
  const db = mongoose.connection.db;
  const usuarios = await db
    .collection("users")
    .find({ email: { $regex: /^e2e_[a-z0-9]+_[a-z0-9]+@example\.test$/ } })
    .project({ _id: 1 })
    .toArray();
  const ids = usuarios.map((u) => u._id);
  const resumen = {};
  for (const nombre of COLECCIONES) {
    const r = await db
      .collection(nombre)
      .deleteMany({ userId: { $in: [...ids, ...ids.map(String)] } });
    resumen[nombre] = r.deletedCount;
  }
  resumen.users = (await db.collection("users").deleteMany({ _id: { $in: ids } })).deletedCount;
  console.log(resumen);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
