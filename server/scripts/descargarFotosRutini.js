// Descarga las fotos de botella de Rutini Wines desde su sitio (rutiniwines.com) y arma el manifest.csv que lee
// importWineImages.js. Cada línea de vinos (Single Vineyard, Colección, Dominio…) tiene una página con una foto
// de producto por etiqueta: 806×1600 sobre fondo casi blanco (o PNG con transparencia, las de Apartado).
//
//   node scripts/descargarFotosRutini.js --out=./fotos-rutini
//   node scripts/recortarFondoBlanco.js --in=./fotos-rutini --out=./fotos-rutini-recortadas
//   npm run import:images -- --dir=./fotos-rutini-recortadas --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos. El robots.txt de la bodega permite leer todo (Disallow vacío).
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - Cada fila dice qué vino del catálogo es (id) o, para vinos que la gente carga a mano con otro nombre, la
//   identidad completa (nombre; bodega; uva). Donde la página tiene dos fotos de la misma etiqueta (Altamira y
//   Gualtallary) se eligió una; el vino del catálogo no distingue parcela.
// - Sin foto de producto en el sitio: Blend of Terroirs, Finca Centenaria, Single Vineyard Chardonnay,
//   Trumpeter Torrontés.
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-rutini");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
const P = "ar-rutini-wines-";
// [línea de la página, archivo de la foto, id del catálogo (sin prefijo) | {name, winery, varietal}]
const FILAS = [
  ["apartado", "Apartado-Gran-Chardonnay-scaled.png", "apartado-gran-chardonnay"],
  ["apartado", "Apartado-Gran-Blend-1-scaled.png", "apartado-gran-blend"],
  ["apartado", "Apartado-Gran-CS-1-scaled.png", "apartado-gran-cabernet-sauvignon"],
  ["single-vineyard", "Single-Vineyard-Malbec-Altamira.jpg", "rutini-single-vineyard-malbec"],
  ["single-vineyard", "Single-Vineyard-Cabernet-Sauvignon-Altamira.jpg", "rutini-single-vineyard-cabernet-sauvignon"],
  ["single-vineyard", "Single-Vineyard-Merlot-Altamira.jpg", "rutini-single-vineyard-merlot"],
  ["single-vineyard", "Single-Vineyard-Cabernet-Franc-Gualtallary.jpg", "rutini-single-vineyard-cabernet-franc"],
  ["rutini-coleccion", "Rutini-Rose-de-Malbec-2023.jpg", "rutini-coleccion-rose"],
  ["rutini-coleccion", "Rutini-Syrah.jpg", "rutini-coleccion-syrah"],
  ["rutini-coleccion", "Rutini-Chardonnay.jpg", "rutini-coleccion-chardonnay"],
  ["rutini-coleccion", "Rutini-Sauvignon-Blanc.jpg", "rutini-coleccion-sauvignon-blanc"],
  ["rutini-coleccion", "Rutini-Brut-Nature.jpg", "rutini-coleccion-brut-nature"],
  ["rutini-coleccion", "Rutini-Cabernet-Franc.jpg", "rutini-coleccion-cabernet-franc"],
  ["rutini-coleccion", "Rutini-Cabernet-Malbec.jpg", "rutini-coleccion-cabernet-malbec"],
  ["rutini-coleccion", "Rutini-Cabernet-Merlot.jpg", "rutini-coleccion-cabernet-merlot"],
  ["rutini-coleccion", "Rutini-Cabernet-Sauvignon.jpg", "rutini-coleccion-cabernet-sauvignon"],
  ["rutini-coleccion", "Rutini-Cabernet-Syrah.jpg", "rutini-coleccion-cabernet-syrah"],
  // Vinos que la gente carga a mano como «Rutini Malbec» / «Rutini Chardonnay» (la etiqueta de la Colección).
  ["rutini-coleccion", "Rutini-Malbec.jpg", { name: "Rutini", winery: "Rutini Wines", varietal: "Malbec" }],
  ["rutini-coleccion", "Rutini-Chardonnay.jpg", { name: "Rutini Chardonnay", winery: "Rutini Wines", varietal: "Chardonnay" }],
  ["dominio", "Dominio-Gran-Malbec.jpg", "dominio-gran-malbec"],
  ["dominio", "Dominio-Malbec.jpg", "dominio-malbec"],
  ["dominio", "Dominio-Brut-Nature.jpg", "dominio-brut-nature"],
  ["dominio", "Dominio-Cabernet-Sauvignon.jpg", "dominio-cabernet-sauvignon"],
  ["dominio", "Dominio-Chardonnay.jpg", "dominio-chardonnay"],
  ["dominio", "Dominio-Extra-Brut.jpg", "dominio-extra-brut"],
  ["dominio", "Dominio-Gran-Blend.jpg", "dominio-gran-blend"],
  ["dominio", "Dominio-Gran-Cabernet-Sauvignon.jpg", "dominio-gran-cabernet-sauvignon"],
  ["encuentro", "Encuentro-Chardonnay.jpg", "encuentro-chardonnay"],
  ["encuentro", "Encuentro-Malbec.jpg", "encuentro-malbec"],
  ["encuentro", "Encuentro-Barrel-Blend.jpg", "encuentro-barrel-blend"],
  ["encuentro", "Encuentro-Brut-Nature-Pinot-Noir.jpg", "encuentro-brut-nature"],
  ["encuentro", "Encuentro-Cabernet-Sauvignon.jpg", "encuentro-cabernet-sauvignon"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Rose-de-Malbec.jpg", "trumpeter-reserve-rose"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Torrontes.jpg", "trumpeter-reserve-torrontes"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Blend.jpg", "trumpeter-reserve-blend"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Bonarda.jpg", "trumpeter-reserve-bonarda"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Cabernet-Sauvignon.jpg", "trumpeter-reserve-cabernet-sauvignon"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Chardonnay.jpg", "trumpeter-reserve-chardonnay"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Malbec.jpg", "trumpeter-reserve-malbec"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Petit-Verdot.jpg", "trumpeter-reserve-petit-verdot"],
  ["trumpeter-reserve", "Trumpeter-Reserve-Pinot-Noir.jpg", "trumpeter-reserve-pinot-noir"],
  ["trumpeter", "Trumpeter-Malbec.jpg", "trumpeter-malbec"],
  ["trumpeter", "Trumpeter-Merlot.jpg", "trumpeter-merlot"],
  ["trumpeter", "Trumpeter-Sauvignon-Blanc.jpg", "trumpeter-sauvignon-blanc"],
  ["trumpeter", "Trumpeter-Syrah.jpg", "trumpeter-syrah"],
  ["trumpeter", "Trumpeter-Brut-Nature.jpg", "trumpeter-brut-nature"],
  ["trumpeter", "Trumpeter-Cabernet-Franc.jpg", "trumpeter-cabernet-franc"],
  ["trumpeter", "Trumpeter-Cabernet-Sauvignon.jpg", "trumpeter-cabernet-sauvignon"],
  ["trumpeter", "Trumpeter-Chardonnay.jpg", "trumpeter-chardonnay"],
  ["antologia", "Antologia-LX-60.jpg", "antologia-blend"],
];
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const informe = [];
  const paginas = new Map();
  for (const [linea, archivo, quien] of FILAS) {
    let identidad;
    if (typeof quien === "string") {
      const w = CATALOG.find((x) => x.id === P + quien);
      if (!w) { informe.push(`SIN CATALOGO ${quien}`); continue; }
      identidad = { name: w.name, winery: w.winery, varietal: w.varietal };
    } else identidad = quien;
    try {
      if (!paginas.has(linea)) {
        paginas.set(linea, await (await fetch(`https://rutiniwines.com/en/${linea}/`, { headers: { "User-Agent": UA } })).text());
        await esperar(1200);
      }
      const html = paginas.get(linea);
      const img = [...html.matchAll(/https:\/\/rutiniwines\.com\/wp-content\/uploads\/[^"'\s)\\]+\.(?:png|jpe?g|webp)/gi)]
        .map((m) => m[0])
        .find((u) => u.endsWith("/" + archivo));
      if (!img) { informe.push(`NO ESTA ${linea}/${archivo}`); continue; }
      const r = await fetch(img, { headers: { "User-Agent": UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) { informe.push(`FALLO ${archivo} ${r.status}`); continue; }
      const nombreArchivo = `${linea}__${archivo}`;
      fs.writeFileSync(path.join(out, nombreArchivo), buf);
      filas.push([nombreArchivo, identidad.name, identidad.winery, identidad.varietal].join(";"));
      informe.push(`OK ${archivo} → ${identidad.name} | ${identidad.varietal} | ${Math.round(buf.length / 1024)}KB`);
    } catch (e) { informe.push(`ERROR ${archivo} ${e.message}`); }
    await esperar(1200);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
