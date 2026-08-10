// Simulacro de backup y restore: la única forma real de saber que un backup
// sirve es restaurarlo y mirar los datos, no confiar en que Atlas dice que
// existe.
//
// Hace tres cosas, siempre en este orden y siempre sobre la MISMA base de
// Atlas (mismo MONGODB_URI, otra base lógica — Atlas no cobra por base extra
// en el mismo cluster):
//
//   1. Vuelca cada colección de `--source` a JSON (formato EJSON, que sí
//      distingue ObjectId de string y Date de texto) en un directorio con
//      fecha. ESO YA ES UN BACKUP: si Atlas no tuviera ninguno configurado,
//      correr esto y guardar la carpeta en otro lado (no en este repo) es
//      mejor que nada.
//   2. Restaura ese volcado en una base sandbox — `${source}__restore_drill`,
//      nunca la que se pidió — y compara colección por colección que lo que
//      entró es lo que salió.
//   3. Con --cleanup, borra la base sandbox al final. El volcado en disco
//      queda: es el backup, no un archivo de trabajo.
//
// La base de origen SÓLO se lee (`find`). Nunca se escribe ni se borra nada
// ahí, con o sin --dry.
//
//   npm run backup:drill -- --dry                 ver qué colecciones y cuántos
//                                                  documentos tiene --source,
//                                                  sin leer un solo documento
//   npm run backup:drill -- --source=rincones      volcado + restore + verificación
//   npm run backup:drill -- --source=rincones --cleanup   ídem, y borra la sandbox

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { EJSON } = require("bson");
const connectToDatabase = require("../src/config/db");

dotenv.config();

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dryRun = args.includes("--dry") || args.includes("--dry-run");
const cleanup = args.includes("--cleanup");

const SANDBOX_SUFFIX = "__restore_drill";
const BACKUPS_DIR = path.resolve(__dirname, "backups");

const run = async () => {
  const source = flag("source");
  if (!source) {
    console.error(
      "Falta --source=<base>. Ejemplo: npm run backup:drill -- --source=rincones\n" +
        "(en desarrollo probá primero con --source=test, que es descartable)"
    );
    process.exit(1);
  }

  const target = `${source}${SANDBOX_SUFFIX}`;
  // Guarda explícita: aunque hoy es matemáticamente imposible que coincidan
  // (el sufijo siempre se agrega), la regla "nunca escribir en `source`" es la
  // única que importa acá y queda dicha en código, no sólo en el comentario de
  // arriba.
  if (target === source) {
    throw new Error("El destino no puede ser igual al origen. Abortando.");
  }

  // Conecta con el URI del .env pero sin fijar la base: este script se mueve
  // entre `source` y la sandbox, y `connectToDatabase` exige una sola base fija
  // (a propósito, ver config/db.js). Se conecta "pelado" y se elige la base con
  // `useDb`, que reutiliza la misma conexión para las dos.
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("Falta MONGODB_URI en el .env");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const sourceDb = mongoose.connection.useDb(source, { useCache: true });
  const colecciones = (await sourceDb.db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."));

  if (colecciones.length === 0) {
    console.log(`"${source}" no tiene colecciones (¿nombre de base correcto?).`);
    return mongoose.disconnect();
  }

  if (dryRun) {
    console.log(`[DRY RUN] "${source}" — no se lee ni se escribe ningún documento.\n`);
    for (const nombre of colecciones) {
      const n = await sourceDb.collection(nombre).countDocuments();
      console.log(`  ${nombre.padEnd(24)} ${n} documento(s)`);
    }
    console.log(`\nCorrida real volcaría a: ${BACKUPS_DIR}/${source}-<fecha>/`);
    console.log(`y restauraría (sólo para comparar) en la base sandbox: ${target}`);
    return mongoose.disconnect();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpDir = path.join(BACKUPS_DIR, `${source}-${timestamp}`);
  fs.mkdirSync(dumpDir, { recursive: true });

  console.log(`Volcando "${source}" (${colecciones.length} colección/es) → ${dumpDir}\n`);

  const conteosOrigen = {};
  for (const nombre of colecciones) {
    const docs = await sourceDb.collection(nombre).find({}).toArray();
    fs.writeFileSync(path.join(dumpDir, `${nombre}.json`), EJSON.stringify(docs, null, 0));
    conteosOrigen[nombre] = docs.length;
    console.log(`  ${nombre.padEnd(24)} ${docs.length} documento(s) volcados`);
  }

  console.log(`\nRestaurando en la base sandbox "${target}"…\n`);
  const targetDb = mongoose.connection.useDb(target, { useCache: true });

  const resultado = [];
  for (const nombre of colecciones) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dumpDir, `${nombre}.json`), "utf8"));
    await targetDb.collection(nombre).deleteMany({}); // la sandbox es descartable: se limpia antes de cada corrida
    if (docs.length > 0) await targetDb.collection(nombre).insertMany(docs, { ordered: false });

    const restaurados = await targetDb.collection(nombre).countDocuments();
    const ok = restaurados === conteosOrigen[nombre];
    resultado.push({ nombre, origen: conteosOrigen[nombre], restaurado: restaurados, ok });
    console.log(`  ${ok ? "✓" : "✗"} ${nombre.padEnd(22)} origen=${conteosOrigen[nombre]}  restaurado=${restaurados}`);
  }

  const fallos = resultado.filter((r) => !r.ok);
  console.log(
    fallos.length === 0
      ? `\nRestore verificado: las ${resultado.length} colecciones coinciden en cantidad de documentos.`
      : `\n${fallos.length} colección/es NO coinciden — revisar antes de confiar en este backup.`
  );
  console.log(
    `\nPara comprobar que Rincones arranca con esta base: apuntá MONGODB_DB_NAME=${target} ` +
      `en un .env de prueba y corré "npm run dev:server". Es un paso manual a propósito — ` +
      `este script no toca variables de entorno ni levanta el servidor por su cuenta.`
  );
  console.log(`\nEl volcado queda en ${dumpDir} — es el backup. Movelo fuera de este repo si lo vas a guardar.`);

  if (cleanup) {
    try {
      await targetDb.dropDatabase();
      console.log(`\nBase sandbox "${target}" eliminada (--cleanup). El volcado en disco no se tocó.`);
    } catch (error) {
      // El usuario de Atlas suele tener readWrite acotado a bases puntuales, sin
      // el rol que hace falta para `dropDatabase`. No es un fallo del simulacro
      // —el restore ya se verificó arriba—, así que se vacía colección por
      // colección con el mismo permiso que ya se usó para escribir, en vez de
      // cortar con error por algo que no hace falta para el resultado.
      console.warn(`\nNo se pudo borrar la base "${target}" (${error.message}). Vaciando colecciones en su lugar…`);
      for (const nombre of colecciones) {
        await targetDb.collection(nombre).deleteMany({});
      }
      console.log(`Colecciones de "${target}" vaciadas. La base queda vacía pero no eliminada.`);
    }
  } else {
    console.log(`\nLa base sandbox "${target}" quedó creada. Corré de nuevo con --cleanup para vaciarla.`);
  }

  await mongoose.disconnect();
  if (fallos.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error("Error en el simulacro de backup/restore:", error.message);
  process.exit(1);
});
