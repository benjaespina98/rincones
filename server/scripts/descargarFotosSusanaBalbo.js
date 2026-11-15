// Descarga las fotos de botella de Susana Balbo Wines y arma el manifest.csv que lee importWineImages.js.
// El sitio (susanabalbowines.com.ar) es una app que carga todo desde su API pública
// (api.susanabalbowines.com.ar/api/public_services/wines, la misma que usa la página): trae cada vino con su
// foto de producto, un PNG de botella con fondo transparente. Una sola consulta y una descarga por foto.
//
//   node scripts/descargarFotosSusanaBalbo.js --out=./fotos-susana-balbo
//   node scripts/recortarFondoBlanco.js --in=./fotos-susana-balbo --out=./fotos-susana-balbo-recortadas
//   npm run import:images -- --dir=./fotos-susana-balbo-recortadas --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos. El robots.txt de la bodega no bloquea nada (Disallow vacío).
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - El mapeo se hace por NOMBRE del vino en la API y se verificó mirando cada etiqueta.
// - Sin foto en la API: BenMarco (tiene otro sitio) y Nosotros Malbec.
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-susana-balbo");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
const HOST = "https://api.susanabalbowines.com.ar";
const P = "ar-susana-balbo-wines-";
// [línea en la API, nombre del vino en la API, id del catálogo (sin prefijo) | {name, winery, varietal}]
const FILAS = [
  ["CRIOS", "MALBEC", "crios-malbec"],
  ["CRIOS", "TORRONTÉS", "crios-torrontes"],
  ["SUSANA BALBO SIGNATURE", "MALBEC", "susana-balbo-signature-malbec"],
  ["SUSANA BALBO SIGNATURE", "BARREL FERMENTED TORRONTÉS", "susana-balbo-signature-torrontes"],
  // Como lo carga la gente a mano: «Susana Balbo Rosé» (el Signature Rosé).
  ["SUSANA BALBO SIGNATURE", "ROSÉ", { name: "Susana Balbo Rosé", winery: "Susana Balbo", varietal: "Malbec" }],
];
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const informe = [];
  const filas = ["archivo;nombre;bodega;varietal"];
  const r = await fetch(`${HOST}/api/public_services/wines`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const vinos = (await r.json())?.response?.wines || [];
  informe.push(`API: ${r.status}, ${vinos.length} vinos`);
  let n = 0;
  for (const [linea, nombre, quien] of FILAS) {
    let identidad;
    if (typeof quien === "string") {
      const w = CATALOG.find((x) => x.id === P + quien);
      if (!w) { informe.push(`SIN CATALOGO ${quien}`); continue; }
      identidad = { name: w.name, winery: w.winery, varietal: w.varietal };
    } else identidad = quien;
    const v = vinos.find((x) => x.line_name === linea && x.wine_name === nombre && x.image_path && x.language_code === "ENG");
    if (!v) { informe.push(`NO ESTA ${linea} / ${nombre}`); continue; }
    await esperar(1200);
    const img = await fetch(HOST + v.image_path, { headers: { "User-Agent": UA } });
    const buf = Buffer.from(await img.arrayBuffer());
    if (!img.ok || !(img.headers.get("content-type") || "").startsWith("image/")) { informe.push(`FALLO ${v.image_path} ${img.status}`); continue; }
    n += 1;
    const archivo = `${String(n).padStart(2, "0")}__${linea.toLowerCase().replace(/[^a-z]+/g, "-")}__${nombre.toLowerCase().replace(/[^a-z]+/g, "-")}.png`;
    fs.writeFileSync(path.join(out, archivo), buf);
    filas.push([archivo, identidad.name, identidad.winery, identidad.varietal].join(";"));
    informe.push(`OK ${linea} / ${nombre} → ${identidad.name} | ${identidad.varietal} | ${Math.round(buf.length / 1024)}KB`);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
