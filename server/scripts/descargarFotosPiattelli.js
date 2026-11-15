// Descarga las fotos de botella de Piattelli desde su sitio (piattellivineyards.com, un sitio Wix) y arma el
// manifest.csv que lee importWineImages.js. Las páginas «Vinos Mendoza» y «Vinos Cafayate» traen un PNG de producto
// por etiqueta con fondo transparente, pero enormes (hasta 13 MB, 2919×9020): se achican a 2000 px de alto.
//
//   npm i --no-save sharp          (sólo para achicar; sin sharp se guardan tal cual)
//   node scripts/descargarFotosPiattelli.js --out=./fotos-piattelli
//   node scripts/recortarFondoBlanco.js --in=./fotos-piattelli --out=./fotos-piattelli-recortadas   (ajusta el margen)
//   npm run import:images -- --dir=./fotos-piattelli-recortadas --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos. El robots.txt de la bodega permite leer todo.
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - El sitio no pone texto alternativo a las imágenes: el mapeo se hizo MIRANDO cada etiqueta (uva y línea).
//   Mendoza = línea negra «Reserve» (en el catálogo: Premium Reserva); Cafayate = cápsula dorada (Reserva).
// - Sin foto en el sitio: Single Vineyard La Calera Malbec.
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-piattelli");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
let sharp = null;
try { sharp = require("sharp"); } catch { /* sin sharp: se guardan tal cual */ }
const P = "ar-piattelli-piattelli-";
// [página, prefijo del archivo en wixstatic, id del catálogo (sin prefijo)]
const FILAS = [
  ["vinosmendoza", "fb2cac_74c4bfbbd593418b9a55c9d788082371", "gran-reserva-trinita-blend"],
  ["vinosmendoza", "476a31_9e9a971f85f345ac96b5935aabac4c20", "single-vineyard-el-manzano-malbec"],
  ["vinosmendoza", "476a31_d354aa890e1f45808bfc6ddf2dd7592d", "single-vineyard-el-manzano-cabernet-sauvignon"],
  ["vinosmendoza", "476a31_9e0b881ccd214137ad5807079d5c346c", "single-vineyard-el-manzano-chardonnay"],
  ["vinosmendoza", "476a31_1cc7b537a89c46d78f4f6d37cdd80e32", "premium-reserva-malbec"],
  ["vinosmendoza", "476a31_1c1cbaad2bf84951ae0119acbde24734", "premium-reserva-cabernet-sauvignon"],
  ["vinosmendoza", "476a31_8515845b93b445d09549b424ad1a3f31", "reserva-rose-malbec"],
  ["vinoscafayate", "476a31_c65ad4f2324949a588fa320446306b1c", "single-vineyard-la-calera-cabernet-sauvignon"],
  ["vinoscafayate", "fb2cac_d8c4cf3f6a784fe1a294a98e7a6d385f", "arlene-series-icon-blend-blend"],
  ["vinoscafayate", "476a31_c21f61e1631b454aadef86a8504b5f70", "reserva-torrontes"],
  ["vinoscafayate", "476a31_3d719fbe762e434a8d4f6c79b78295e2", "reserva-malbec"],
  ["vinoscafayate", "476a31_5214ee19949749f89698971a4891d106", "reserva-cabernet-sauvignon"],
  ["vinoscafayate", "476a31_3ad5320968fb4131b62b7adf60615fb7", "reserva-malbec-tannat-blend"],
];
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const informe = [];
  const paginas = new Map();
  for (const [pagina, prefijo, id] of FILAS) {
    const w = CATALOG.find((x) => x.id === P + id);
    if (!w) { informe.push(`SIN CATALOGO ${id}`); continue; }
    try {
      if (!paginas.has(pagina)) {
        paginas.set(pagina, await (await fetch(`https://www.piattellivineyards.com/${pagina}`, { headers: { "User-Agent": UA } })).text());
        await esperar(1200);
      }
      const m = paginas.get(pagina).match(new RegExp("static\\.wixstatic\\.com/media/(" + prefijo + "[a-zA-Z0-9_~.-]*\\.(?:png|jpe?g))"));
      if (!m) { informe.push(`NO ESTA ${pagina}/${prefijo}`); continue; }
      const r = await fetch("https://static.wixstatic.com/media/" + m[1], { headers: { "User-Agent": UA } });
      let buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) { informe.push(`FALLO ${m[1]} ${r.status}`); continue; }
      if (sharp) buf = await sharp(buf, { limitInputPixels: false }).resize({ height: 2000, withoutEnlargement: true }).png().toBuffer();
      const archivo = `${id}.png`;
      fs.writeFileSync(path.join(out, archivo), buf);
      filas.push([archivo, w.name, w.winery, w.varietal].join(";"));
      informe.push(`OK ${id} | ${Math.round(buf.length / 1024)}KB`);
    } catch (e) { informe.push(`ERROR ${id} ${e.message}`); }
    await esperar(1200);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
