// Prepara y revisa un lote de fotos reales de vinos ANTES de importarlo al pool.
//
// No toca ninguna base de datos ni la red: sólo lee y escribe archivos de la carpeta que le pases.
//
//   npm run fotos:preparar -- --dir=./fotos                 arma ./fotos/manifest.csv con todos los vinos del catálogo
//   npm run fotos:preparar -- --dir=./fotos --verificar     revisa las fotos que ya pusiste en la carpeta
//
// Flujo completo:
//   1. `--dir=./fotos`: crea el manifest con un nombre de archivo sugerido para cada vino.
//   2. Copiá las fotos a esa carpeta con ESOS nombres (sólo las que tengas: el resto queda para después).
//   3. `--verificar`: te dice qué está bien, qué es un error y qué conviene mejorar (resolución, orientación, peso).
//   4. `npm run import:images -- --dir=./fotos --dry`  y después sin `--dry`  (ver scripts/importWineImages.js).
//
// La carpeta va FUERA del repo: las fotos de producto tienen dueño y no se commitean.

const fs = require("fs");
const path = require("path");
const { armarManifest, evaluarCarpeta, parsearManifest, vinosDelCatalogo } = require("../src/utils/prepararFotos");

const args = process.argv.slice(2);
// Todo lo que sigue al primer «=»: una carpeta con «=» en el nombre no se trunca.
const flag = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(a.indexOf("=") + 1) : undefined;
};
const verificar = args.includes("--verificar");
const force = args.includes("--force");

const dir = flag("dir");
if (!dir) {
  console.error("Falta --dir=<carpeta>. Ejemplo: npm run fotos:preparar -- --dir=./fotos");
  process.exit(1);
}
const carpeta = path.resolve(dir);
const manifestPath = path.join(carpeta, "manifest.csv");

if (!verificar) {
  if (fs.existsSync(manifestPath) && !force) {
    console.error(`Ya existe ${manifestPath}. Con --force se pisa (perdés lo que hayas anotado ahí).`);
    process.exit(1);
  }
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(manifestPath, armarManifest(), "utf8");
  console.log(`Listo: ${manifestPath} (${vinosDelCatalogo().length} vinos).`);
  console.log("Copiá las fotos a esa carpeta con los nombres de la columna `archivo` y corré de nuevo con --verificar.");
  process.exit(0);
}

if (!fs.existsSync(manifestPath)) {
  console.error(`No encuentro ${manifestPath}. Primero corré sin --verificar para generarlo.`);
  process.exit(1);
}

let filas;
try {
  filas = parsearManifest(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`${manifestPath}: ${error.message}`);
  process.exit(1);
}

const archivos = new Map();
for (const nombre of fs.readdirSync(carpeta)) {
  const ruta = path.join(carpeta, nombre);
  if (fs.statSync(ruta).isFile() && nombre !== "manifest.csv") archivos.set(nombre, fs.readFileSync(ruta));
}

const r = evaluarCarpeta(filas, archivos);
console.log(`Fotos válidas: ${r.ok.length}`);
console.log(`Vinos del manifest todavía sin foto: ${r.sinFoto}`);
if (r.errores.length) {
  console.log(`\nERRORES (${r.errores.length}) — estas NO se van a poder importar:`);
  for (const e of r.errores) console.log(`  fila ${e.fila} · ${e.archivo}: ${e.motivo}`);
}
if (r.avisos.length) {
  console.log(`\nAVISOS (${r.avisos.length}) — se importan, pero conviene mirarlas:`);
  for (const a of r.avisos) console.log(`  fila ${a.fila} · ${a.archivo}: ${a.motivo}`);
}
if (r.sinFila.length) {
  console.log(`\nArchivos en la carpeta que ninguna fila del manifest usa (${r.sinFila.length}):`);
  for (const a of r.sinFila) console.log(`  ${a}`);
}
process.exit(r.errores.length ? 1 : 0);
