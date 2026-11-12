// Presupuesto de la carga inicial: lo que index.html pide al abrir (script de entrada, chunks
// precargados y CSS), comprimido con gzip. Falla si pasa del tope. Se corre después del build.
//
//   node scripts/check-bundle.cjs [topeEnKB]     (por defecto 143, el presupuesto de CLAUDE.md)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const dist = path.join(__dirname, "..", "dist");
const tope = Number(process.argv[2]) || 143;
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const archivos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (archivos.length === 0) {
  console.error("check-bundle: index.html no referencia ningún archivo de /assets");
  process.exit(1);
}

let total = 0;
for (const a of [...new Set(archivos)]) {
  const kb = zlib.gzipSync(fs.readFileSync(path.join(dist, a))).length / 1000;
  total += kb;
  console.log(`  ${kb.toFixed(1).padStart(6)} kB  ${a}`);
}
console.log(`carga inicial: ${total.toFixed(1)} kB gzip (tope ${tope})`);
if (total > tope) {
  console.error("check-bundle: la carga inicial pasa del presupuesto");
  process.exit(1);
}
