// Pone de pie las fotos de botella ACOSTADA (apaisadas, con fondo transparente) que publica Catena Zapata:
// las gira 90° a la izquierda (así las etiquetas quedan legibles), recorta el borde transparente y las guarda
// como PNG con un manifest.csv nuevo. Las imágenes sin transparencia o que no son apaisadas (fotos de ambiente)
// se saltean.
//
//   node scripts/descargarFotosCatena.js --out=./fotos-catena
//   node scripts/rotarBotellasAcostadas.js --in=./fotos-catena --out=./fotos-catena-de-pie
//   npm run import:images -- --dir=./fotos-catena-de-pie --dry     (después, sin --dry)
//
// Requiere sharp: npm i --no-save sharp
const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("Falta sharp (no es dependencia del proyecto). Instalalo sin guardarlo: npm i --no-save sharp");
  process.exit(1);
}
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const IN = path.resolve(arg("in") || "./fotos-catena");
const OUT = path.resolve(arg("out") || "./fotos-catena-de-pie");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const lineas = fs.readFileSync(path.join(IN, "manifest.csv"), "utf8").split(/\r?\n/).slice(1).filter(Boolean);
  for (const linea of lineas) {
    const [archivo, ...resto] = linea.split(";");
    const meta = await sharp(path.join(IN, archivo)).metadata();
    if (!meta.hasAlpha || meta.width / meta.height < 1.5) {
      console.log(`salteada (no es botella acostada): ${archivo}`);
      continue;
    }
    const salida = archivo.replace(/\.[^.]+$/, ".png");
    await sharp(path.join(IN, archivo)).rotate(-90).trim().png().toFile(path.join(OUT, salida));
    filas.push([salida, ...resto].join(";"));
  }
  fs.writeFileSync(path.join(OUT, "manifest.csv"), filas.join("\n") + "\n");
  console.log(`${filas.length - 1} foto(s) en ${OUT}`);
})();
