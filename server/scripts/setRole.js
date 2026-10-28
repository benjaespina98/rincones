// Cambia el rol de un usuario existente desde la línea de comandos.
//
// Es la salida de emergencia: si te quedás sin ninguna cuenta admin (porque te
// bajaste el rol, borraste la cuenta, o simplemente no te acordás cuál era),
// desde el panel no hay forma de arreglarlo. Esto sí.
//
//   npm run role -- tu@email.com admin
//   npm run role -- alguien@mail.com user
//   npm run role -- --list

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const User = require("../src/models/user.model");

dotenv.config();

const listUsers = async () => {
  const users = await User.find().select("email role firstName createdAt").sort({ createdAt: 1 }).lean();
  console.log(`\n${users.length} usuario(s):\n`);
  for (const u of users) {
    const role = (u.role || "user").padEnd(6);
    const mark = u.role === "admin" ? "  ← ADMIN" : "";
    console.log(`  ${role} ${(u.email || "").padEnd(34)} ${(u.firstName || "—").padEnd(14)}${mark}`);
  }
  const admins = users.filter((u) => u.role === "admin").length;
  console.log(`\n${admins} admin(s).${admins === 0 ? "  ⚠ Nadie puede entrar al panel." : ""}\n`);
};

const run = async () => {
  const [arg1, arg2] = process.argv.slice(2);

  try {
    await connectToDatabase();

    if (!arg1 || arg1 === "--list" || arg1 === "-l") {
      await listUsers();
      process.exit(0);
    }

    const email = String(arg1).trim().toLowerCase();
    const role = String(arg2 || "").trim().toLowerCase();

    if (!["user", "admin"].includes(role)) {
      console.error(`Rol inválido: "${arg2}". Usá "admin" o "user".`);
      console.error(`Ejemplo: npm run role -- ${email} admin`);
      process.exit(1);
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No existe ningún usuario con el mail "${email}".`);
      console.error("Listá los que hay con:  npm run role -- --list");
      process.exit(1);
    }

    // Bajar al último admin deja la app sin panel: avisamos antes de hacerlo.
    if (user.role === "admin" && role === "user") {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        console.error(`"${email}" es el ÚNICO admin. Si lo bajás, nadie va a poder entrar al panel.`);
        console.error("Promové a otro primero.");
        process.exit(1);
      }
    }

    const before = user.role || "user";
    user.role = role;
    await user.save();

    console.log(`✔ ${email}: ${before} → ${role}`);
    await listUsers();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

run();
