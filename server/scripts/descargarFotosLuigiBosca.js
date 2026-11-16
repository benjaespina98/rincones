// Descarga las fotos de botella de Luigi Bosca desde su sitio (luigibosca.com) y arma el manifest.csv
// que lee importWineImages.js. Una página por vino, `og:image` = foto de producto de la bodega.
//
//   node scripts/descargarFotosLuigiBosca.js --out=./fotos-luigi-bosca
//   npm run import:images -- --dir=./fotos-luigi-bosca --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos, para no cargar el sitio. El robots.txt de la bodega permite leer estas páginas.
// - Las fotos son de la bodega, no tienen licencia abierta: se muestran con su crédito.
// - Mapeo catálogo → página verificado por el título de cada página (og:title). NO están mapeados:
//   Finca Los Nobles, Gala 1, Gala 3, La Linda y Luigi Bosca Riesling (no tienen página de producto).
//   «Legado Malbec» se sacó: la página candidata es en realidad Finca Los Nobles Malbec DOC.
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-luigi-bosca");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
const B = "https://luigibosca.com/nuestros-vinos/";
// id del catálogo (sin el prefijo ar-luigi-bosca-) → página del vino en luigibosca.com
const MAPA = {
  "luigi-bosca-insignia-chardonnay": "coleccion-insignia/chardonnay/",
  "luigi-bosca-insignia-sauvignon-blanc": "coleccion-insignia/sauvignon-blanc/",
  "luigi-bosca-insignia-pinot-noir": "coleccion-insignia/pinot-noir/",
  "luigi-bosca-insignia-malbec": "coleccion-insignia/malbec/",
  "luigi-bosca-insignia-cabernet-sauvignon": "coleccion-insignia/insignia-cabernet-sauvignon/",
  "luigi-bosca-insignia-rose": "coleccion-insignia/rose-is-a-rose/",
  "luigi-bosca-insignia-gewurztraminer": "coleccion-insignia/gewurztraminer-seleccion-de-granos-nobles/",
  "luigi-bosca-insignia-riesling": "coleccion-insignia/riesling-las-compuertas/",
  "luigi-bosca-de-sangre-chardonnay": "coleccion-de-sangre/coleccion-de-sangre-chardonnay/",
  "luigi-bosca-de-sangre-white-blend": "coleccion-de-sangre/white-blend/",
  "luigi-bosca-de-sangre-malbec": "coleccion-de-sangre/malbec-valle-de-uco/",
  "luigi-bosca-de-sangre-cabernet-franc": "coleccion-de-sangre/cabernet-franc/",
  "luigi-bosca-de-sangre-cabernet-sauvignon": "coleccion-de-sangre/cabernet-sauvignon/",
  "luigi-bosca-de-sangre-corte": "coleccion-de-sangre/corte/",
  "luigi-bosca-apuntes-semillon": "apuntes/semillon/",
  "luigi-bosca-apuntes-naranjo": "apuntes/naranjo/",
  "luigi-bosca-apuntes-malbec-organico": "apuntes/malbec-organico/",
  "luigi-bosca-apuntes-grenache": "apuntes/grenache/",
  "luigi-bosca-legado-leon": "coleccion-legado/leon/",
  "luigi-bosca-legado-filos-chardonnay": "coleccion-legado/filos-chardonnay/",
  "luigi-bosca-legado-paraiso": "coleccion-legado/paraiso/",
};
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const informe = [];
  for (const [id, ruta] of Object.entries(MAPA)) {
    const w = CATALOG.find((x) => x.id === "ar-luigi-bosca-" + id);
    if (!w) { informe.push(`SIN CATALOGO ${id}`); continue; }
    try {
      const html = await (await fetch(B + ruta, { headers: { "User-Agent": UA } })).text();
      const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      const titulo = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
      if (!img) { informe.push(`SIN IMAGEN ${id}`); continue; }
      await esperar(1200);
      const r = await fetch(img, { headers: { "User-Agent": UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      if (!r.ok || !ct.startsWith("image/")) { informe.push(`FALLO ${id} ${r.status} ${ct}`); continue; }
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
