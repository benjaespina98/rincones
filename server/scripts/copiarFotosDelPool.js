// Pasa las fotos del pool (WineImage) de una base a otra SIN volver a subir nada.
//
// Las fotos ya están en Cloudinary (las subió importWineImages.js cuando se probó en `test`): el pool sólo guarda
// la URL. Para llevarlas a producción alcanza con copiar esos documentos, y no se duplica ninguna imagen.
//
//   # 1) Ver qué copiaría (no escribe nada):
//   node scripts/copiarFotosDelPool.js --origen=test --destino=rincones
//   # 2) Copiar de verdad (hay que repetir el nombre de la base destino):
//   node scripts/copiarFotosDelPool.js --origen=test --destino=rincones --aplicar --confirmo-destino=rincones
//
// Opciones:
//   --bodegas=Rutini,Zuccardi   sólo las fotos cuya bodega contenga alguno de esos textos
//   --force                     pisa la foto que ya tenga el vino en el destino (por defecto se respeta)
//
// ── QUÉ COPIA Y QUÉ NO ──────────────────────────────────────────────────────────────────────────────
// - Sólo fotos con puntaje de calidad >= 70 (las que la tarjeta de Descubrí considera confiables) y cuya URL sea
//   de NUESTRO Cloudinary. Nunca copia una foto sin evaluar ni una URL ajena.
// - Respeta la regla del pool: si el vino ya tiene foto en el destino, se salta.
// - Sólo lee de `origen` y sólo escribe en `destino`. No toca vinos ni usuarios: la foto aparece sola para quien
//   tenga o busque ese vino (ver wineImages.conFotoConfiable).
// - Sin --aplicar es siempre simulacro. Con --aplicar exige --confirmo-destino=<la misma base>.
const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const { esUrlPropia } = require("../src/services/imageStorage.service");
const wineImageSchema = require("../src/models/wineImage.model").schema;

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);
const MIN_CALIDAD = 70;

const origen = arg("origen");
const destino = arg("destino");
const aplicar = flag("aplicar");
const force = flag("force");
const bodegas = (arg("bodegas") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const salir = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

(async () => {
  if (!origen || !destino) salir("Falta --origen=<base> y --destino=<base>.");
  if (origen === destino) salir("El origen y el destino son la misma base.");
  if (aplicar && arg("confirmo-destino") !== destino) {
    salir(`Para escribir hay que repetir la base destino: --confirmo-destino=${destino}`);
  }
  if (!process.env.MONGODB_URI) salir("No hay MONGODB_URI (server/.env).");

  console.log("════════════════════════════════════════════════");
  console.log(` Copiar fotos del pool:  ${origen}  →  ${destino}`);
  console.log(` Modo: ${aplicar ? "APLICAR (escribe en " + destino + ")" : "SIMULACRO (no escribe)"}${force ? " · --force" : ""}`);
  if (bodegas.length) console.log(` Bodegas: ${bodegas.join(", ")}`);
  console.log("════════════════════════════════════════════════");

  const cOrigen = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: origen }).asPromise();
  const cDestino = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: destino }).asPromise();
  const Origen = cOrigen.model("WineImage", wineImageSchema);
  const Destino = cDestino.model("WineImage", wineImageSchema);

  const docs = await Origen.find({ qualityScore: { $gte: MIN_CALIDAD } }).lean();
  const candidatos = docs.filter(
    (d) => esUrlPropia(d.image) && (bodegas.length === 0 || bodegas.some((b) => String(d.winery || "").toLowerCase().includes(b)))
  );
  console.log(`Origen: ${docs.length} fotos con puntaje >= ${MIN_CALIDAD}, ${candidatos.length} elegibles (Cloudinary propio${bodegas.length ? " y bodega pedida" : ""}).`);

  const existentes = new Map((await Destino.find({ key: { $in: candidatos.map((d) => d.key) } }).select("key image").lean()).map((d) => [d.key, d.image]));
  let nuevas = 0;
  let pisadas = 0;
  let saltadas = 0;
  for (const d of candidatos) {
    const hay = existentes.has(d.key);
    if (hay && !force) {
      saltadas += 1;
      continue;
    }
    if (hay && existentes.get(d.key) === d.image) {
      saltadas += 1;
      continue;
    }
    if (hay) pisadas += 1;
    else nuevas += 1;
    console.log(`  ${hay ? "pisa " : "nueva"}  ${d.name || ""} (${d.winery || ""})  → ${d.key}`);
    if (aplicar) {
      await Destino.updateOne(
        { key: d.key },
        { $set: { image: d.image, name: d.name, winery: d.winery, qualityScore: d.qualityScore }, $setOnInsert: { key: d.key } },
        { upsert: true }
      );
    }
  }
  console.log("────────────────────────────────────────────────");
  console.log(` ${aplicar ? "Copiadas" : "Copiaría"}: ${nuevas} nuevas, ${pisadas} pisadas. Saltadas (ya tenían foto): ${saltadas}.`);
  if (!aplicar) console.log(" Es un simulacro: para copiar, agregá --aplicar --confirmo-destino=" + destino);
  await cOrigen.close();
  await cDestino.close();
})().catch((e) => salir(e.message));
