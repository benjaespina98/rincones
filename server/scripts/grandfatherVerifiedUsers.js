// Da por verificado el email de las cuentas que ya existían antes de que la
// verificación de email fuera obligatoria.
//
// ── LA DECISIÓN ──────────────────────────────────────────────────────────────
// El gate nuevo (ver AppGate en el cliente y `emailVerified` en el modelo)
// exige confirmar el email antes de entrar a la app. Pedírselo retroactivamente
// a cuentas que ya venían usando Rincones normalmente —sin haber hecho nada
// mal— las deja afuera de golpe por una regla que no existía cuando se
// registraron. Es la peor experiencia posible en una beta con pocos usuarios:
// gente real, de confianza, bloqueada sin aviso.
//
// La cuenta sigue siendo la misma cuenta con la que ya vienen entrando: no hay
// nada nuevo que verificar, sólo una regla nueva que no las alcanza. Así que
// se marcan como verificadas una sola vez, acá, y de acá en más el gate corre
// como corresponde para toda cuenta CREADA a partir de este cambio.
//
// Es idempotente (sólo toca `emailVerified: false`, así que correrlo dos veces
// no hace nada la segunda) y no toca contraseñas, tokens ni ningún otro dato.
//
//   npm run migrate:verify-existing -- --dry     ver a cuántas cuentas afecta
//   npm run migrate:verify-existing              aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const User = require("../src/models/user.model");

dotenv.config();

const run = async () => {
  const dryRun = process.argv.slice(2).some((a) => a === "--dry" || a === "--dry-run");

  await connectToDatabase();

  const filtro = { emailVerified: { $ne: true } };
  const total = await User.countDocuments(filtro);

  console.log(`\n${total} cuenta(s) sin verificar de antes de este cambio.${dryRun ? "  [DRY RUN — no se escribe nada]" : ""}\n`);

  if (total === 0) {
    console.log("Nada para migrar.\n");
    return;
  }

  if (dryRun) {
    const muestra = await User.find(filtro, { email: 1, createdAt: 1 }).limit(20).lean();
    for (const u of muestra) console.log(`  ${u.email}  (creada ${u.createdAt?.toISOString?.() || "?"})`);
    if (total > muestra.length) console.log(`  … y ${total - muestra.length} más`);
    console.log("\nCorré sin --dry para aplicarlo.\n");
    return;
  }

  const resultado = await User.updateMany(filtro, {
    $set: { emailVerified: true },
    $unset: { emailVerificationToken: "", emailVerificationExpires: "" },
  });

  console.log(`${resultado.modifiedCount} cuenta(s) marcada(s) como verificadas.\n`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en la migración:", error.message);
    process.exit(1);
  });
