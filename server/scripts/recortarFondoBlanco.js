// Quita el fondo blanco de las fotos de botella (JPG/PNG de la bodega) y las guarda como PNG con
// transparencia, junto con un manifest.csv nuevo. La tarjeta de Descubrí y la ficha dibujan la botella
// con sombra y halo propios (WinePhoto, fit="contain"): con el fondo blanco original se ve como un
// recuadro pegado sobre la tarjeta oscura.
//
//   node scripts/recortarFondoBlanco.js --in=./fotos-luigi-bosca --out=./fotos-luigi-bosca-recortadas
//   npm run import:images -- --dir=./fotos-luigi-bosca-recortadas --dry     (después, sin --dry)
//
// Sólo se saca el blanco CONECTADO al borde de la imagen (relleno por inundación): una etiqueta
// blanca adentro de la botella no se toca. Requiere sharp: npm i --no-save sharp
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
const IN = path.resolve(arg("in") || "./fotos-luigi-bosca");
const OUT = path.resolve(arg("out") || "./fotos-luigi-bosca-recortadas");
fs.mkdirSync(OUT, { recursive: true });
const casiBlanco = (d, i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; return Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 14; };
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const manifiesto = fs.readFileSync(IN + "/manifest.csv", "utf8").split(/\r?\n/).filter(Boolean).slice(1);
  for (const linea of manifiesto) {
    const [archivo, ...resto] = linea.split(";");
    const base = path.basename(archivo, path.extname(archivo));
    const { data, info } = await sharp(path.join(IN, archivo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const vis = new Uint8Array(w * h);
    const cola = new Int32Array(w * h);
    let ini = 0, fin = 0;
    const push = (x, y) => { const p = y * w + x; if (vis[p]) return; if (!casiBlanco(data, p * 4)) return; vis[p] = 1; cola[fin++] = p; };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (ini < fin) {
      const p = cola[ini++]; const x = p % w, y = (p / w) | 0;
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    // alfa: fondo → 0; borde de 1 px apenas claro → medio transparente (suaviza el halo blanco del JPG)
    let removidos = 0;
    for (let p = 0; p < w * h; p++) {
      if (vis[p]) { data[p * 4 + 3] = 0; removidos++; continue; }
      const x = p % w, y = (p / w) | 0;
      const vecino = (x > 0 && vis[p - 1]) || (x < w - 1 && vis[p + 1]) || (y > 0 && vis[p - w]) || (y < h - 1 && vis[p + w]);
      if (vecino) { const m = Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]); data[p * 4 + 3] = m >= 205 ? 0 : m >= 170 ? 120 : 255; }
    }
    const png = base + ".png";
    await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png({ compressionLevel: 9 }).toFile(path.join(OUT, png));
    const m2 = await sharp(path.join(OUT, png)).metadata();
    filas.push([png, ...resto].join(";"));
    console.log(base, `${w}x${h} -> ${m2.width}x${m2.height}`, "fondo quitado:", Math.round((removidos / (w * h)) * 100) + "%");
  }
  fs.writeFileSync(OUT + "/manifest.csv", filas.join("\n") + "\n");
})();
