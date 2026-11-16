// Descarga las fotos de botella de Catena Zapata desde su sitio (catenazapata.com) y arma el manifest.csv
// que lee importWineImages.js. Una página por vino (cosecha vigente), `og:image` = foto de producto.
//
//   node scripts/descargarFotosCatena.js --out=./fotos-catena
//   node scripts/rotarBotellasAcostadas.js --in=./fotos-catena --out=./fotos-catena-de-pie
//   npm run import:images -- --dir=./fotos-catena-de-pie --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos. El robots.txt de la bodega permite leer estas páginas (sólo bloquea wp-admin, búsquedas y /wp-json).
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - Se imprime el og:title de cada página para verificar a ojo que sea el vino del catálogo; el informe marca
//   las imágenes repetidas (una misma foto para dos vinos distintos no se importa).
// - OJO, medido 2026-11-15: el sitio sólo publica UNA imagen por vino y es apaisada (600x190 o 600x324). 16 de las 25 son la
//   botella ACOSTADA con fondo transparente (Catena, Angélica Zapata, DV Catena, Saint Felicien); las otras 9 (Catena Alta,
//   Nicolás Catena Zapata, White Stones, Alta Cabernet/Chardonnay) son fotos de ambiente, no de producto. La tarjeta de
//   Descubrí espera la botella de pie: rotarBotellasAcostadas.js las pone de pie (20 con transparencia) y saltea las de ambiente.
// - NO están mapeados: Alamos, Alma Negra, Tikal y Siesta (otros sitios).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-catena");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
const B = "https://catenazapata.com/";
// id del catálogo (sin el prefijo ar-catena-zapata-) → página del vino (cosecha vigente)
const MAPA = {
  "catena-malbec": "catena-malbec-2024/",
  "catena-cabernet-sauvignon": "catena-cabernet-sauvignon-2023/",
  "catena-chardonnay": "catena-chardonnay-2024/",
  "catena-alta-malbec": "catena-alta-malbec-2023/",
  "catena-alta-cabernet-sauvignon": "catena-alta-cabernet-sauvignon-2022/",
  "catena-alta-chardonnay": "catena-alta-chardonnay-2024/",
  "nicolas-catena-zapata-blend": "nicolas-catena-zapata-2022/",
  "adrianna-vineyard-white-stones-chardonnay": "white-stones-2023/",
  "angelica-zapata-malbec": "angelica-malbec/",
  "angelica-zapata-cabernet-sauvignon": "angelica-cabernet/",
  "angelica-zapata-cabernet-franc": "angelica-cabernet-franc/",
  "angelica-zapata-merlot": "angelica-merlot/",
  "angelica-zapata-chardonnay": "angelica-chardonnay/",
  "saint-felicien-malbec": "saint-felicien-malbec/",
  "saint-felicien-cabernet-sauvignon": "saint-felicien-cabernet/",
  "saint-felicien-cabernet-franc": "saint-felicien-cabernet-franc/",
  "saint-felicien-bonarda": "saint-felicien-bonarda/",
  "saint-felicien-sangiovese": "saint-felicien-sangiovese/",
  "saint-felicien-syrah": "saint-felicien-syrah/",
  "saint-felicien-chardonnay": "saint-felicien-chardonnay/",
  "saint-felicien-sauvignon-blanc": "saint-felicien-sauvignon/",
  "dv-catena-malbec": "dv-malbec/",
  "dv-catena-cabernet-sauvignon": "dv-cabernet/",
  "dv-catena-syrah": "dv-syrah/",
  "dv-catena-chardonnay": "dv-chardonnay/",
};
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const informe = [];
  const vistos = new Map();
  for (const [id, ruta] of Object.entries(MAPA)) {
    const w = CATALOG.find((x) => x.id === "ar-catena-zapata-" + id);
    if (!w) { informe.push(`SIN CATALOGO ${id}`); continue; }
    try {
      const html = await (await fetch(B + ruta, { headers: { "User-Agent": UA } })).text();
      const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      const titulo = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
      if (!img) { informe.push(`SIN IMAGEN ${id} | "${titulo}"`); continue; }
      await esperar(1200);
      const r = await fetch(img, { headers: { "User-Agent": UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      if (!r.ok || !ct.startsWith("image/")) { informe.push(`FALLO ${id} ${r.status} ${ct}`); continue; }
      const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
      if (vistos.has(hash)) { informe.push(`REPETIDA ${id} = ${vistos.get(hash)} | "${titulo}"`); continue; }
      vistos.set(hash, id);
      const ext = path.extname(new URL(img).pathname).toLowerCase() || ".jpg";
      const archivo = id + ext;
      fs.writeFileSync(path.join(out, archivo), buf);
      filas.push([archivo, w.name, w.winery, w.varietal].join(";"));
      informe.push(`OK ${id} | "${titulo}" | ${Math.round(buf.length / 1024)}KB | ${img}`);
    } catch (e) { informe.push(`ERROR ${id} ${e.message}`); }
    await esperar(1200);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
