// Descarga las fotos de botella de Matías Riccitelli desde su tienda (matiasriccitelli.com, WooCommerce) y arma el
// manifest.csv que lee importWineImages.js. Usa la API pública de la tienda (la que usa la propia página): una sola
// consulta con cada producto y su foto, y una descarga por foto.
//
//   node scripts/descargarFotosRiccitelli.js --out=./fotos-riccitelli
//   node scripts/recortarFondoBlanco.js --in=./fotos-riccitelli --out=./fotos-riccitelli-recortadas
//   npm run import:images -- --dir=./fotos-riccitelli-recortadas --dry     (después, sin --dry)
//
// - 1,2 s entre pedidos. El robots.txt de la bodega sólo bloquea los logs de WooCommerce.
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - El mapeo es por NOMBRE de producto y cada foto se revisó a ojo: sólo se usan las de UNA botella (varias de
//   Kung Fu, Invader y Old Vines muestran la línea completa y no sirven para un vino).
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-riccitelli");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
const P = "ar-matias-riccitelli-";
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const limpiar = (s) => String(s || "").replace(/&#8217;|&#8211;|&#038;|&amp;/g, (m) => ({ "&#8217;": "'", "&#8211;": "-", "&#038;": "&", "&amp;": "&" }[m])).toLowerCase().replace(/\s+/g, " ").trim();
// [id del catálogo (sin prefijo), nombre del producto en la tienda]
const FILAS = JSON.parse(process.env.RICCITELLI_FILAS || "null") || [
  ["hey-malbec-malbec", "hey malbec!"],
  ["hey-franc-cabernet-franc", "hey franc!"],
  ["hey-rose-malbec", "hey rosé!"],
  ["the-apple-doesn-t-fall-far-from-the-tree-malbec", "the apple doesn't fall far from the tree, malbec"],
  ["the-apple-doesn-t-fall-far-from-the-tree-cabernet-sauvignon", "the apple doesn't fall far from the tree, cabernet sauvignon"],
  ["the-apple-doesn-t-fall-far-from-the-tree-bonarda", "the apple doesn't fall far from the tree, bonarda"],
  ["the-apple-doesn-t-fall-far-from-the-tree-torrontes", "the apple doesn't fall far from the tree, torrontés"],
  ["the-party-malbec", "the party malbec"],
  ["vino-de-la-casa-malbec", "tinto de la casa malbec"],
  ["blanco-de-la-casa-blend", "blanco de la casa"],
  ["republica-del-malbec-malbec", "república del malbec"],
  ["riccitelli-father-blend", "riccitelli & father"],
  ["riccitelli-gualtallary-malbec", "riccitelli gualtallary malbec"],
  ["riccitelli-gualtallary-cabernet-franc", "riccitelli gualtallary cabernet franc"],
  ["riccitelli-gualtallary-chardonnay", "riccitelli gualtallary chardonnay-sold out!"],
  ["riccitelli-gualtallary-garnacha", "riccitelli gualtallary garnacha"],
  ["viejos-vinedos-en-pie-franco-malbec", "viejos viñedos en pie franco malbec"],
  ["viejos-vinedos-en-pie-franco-sangiovese", "viejos viñedos en pie franco sangiovese"],
  ["viejos-vinedos-en-pie-franco-semillon", "viejos viñedos en pie franco semillón"],
  ["vinas-extremas-vino-de-los-chacayes-malbec", "viñas extremas malbec | vino de los chacayes"],
  ["vinas-extremas-vino-de-la-carrera-sauvignon-blanc", "viñas extremas sauvignon blanc | vino de la carrera"],
  ["old-vines-from-patagonia-merlot", "old vines from patagonia merlot"],
  ["old-vines-from-patagonia-semillon", "old vines from patagonia semillón"],
  ["old-vines-from-patagonia-torrontes", "old vines from patagonia torrontés"],
  ["old-vines-from-patagonia-riesling", "old vines from patagonia riesling"],
  ["kung-fu-malbec", "kung fu malbec"],
  ["kung-fu-criolla", "kung fu criolla"],
  ["kung-fu-orange-semillon", "kung fu orange"],
  ["kung-fu-pet-nat-malbec", "kung fu pet nat"],
  ["invader-semillon", "semillón invader"],
  ["invader-chenin-blanc", "chenin blanc invader"],
  ["invader-garnacha", "garnacha invader – sold out!"],
  ["this-is-not-another-lovely-wine-malbec", "this is not another lovely malbec"],
  ["this-is-not-another-lovely-wine-torrontes", "this is not another lovely torrontés"],
];
(async () => {
  const informe = [];
  const filas = ["archivo;nombre;bodega;varietal"];
  const r = await fetch("https://matiasriccitelli.com/wp-json/wc/store/v1/products?per_page=100", { headers: { "User-Agent": UA, Accept: "application/json" } });
  const productos = await r.json();
  informe.push(`API: ${r.status}, ${productos.length} productos`);
  for (const [id, nombre] of FILAS) {
    const w = CATALOG.find((x) => x.id === P + id);
    if (!w) { informe.push(`SIN CATALOGO ${id}`); continue; }
    const p = productos.find((x) => limpiar(x.name) === nombre || limpiar(x.name).startsWith(nombre));
    const src = p?.images?.[0]?.src;
    if (!src) { informe.push(`NO ESTA ${nombre}`); continue; }
    await esperar(1200);
    const img = await fetch(src, { headers: { "User-Agent": UA } });
    const buf = Buffer.from(await img.arrayBuffer());
    if (!img.ok || !(img.headers.get("content-type") || "").startsWith("image/")) { informe.push(`FALLO ${src} ${img.status}`); continue; }
    const ext = path.extname(new URL(src).pathname).toLowerCase() || ".jpg";
    const archivo = `${id}${ext}`;
    fs.writeFileSync(path.join(out, archivo), buf);
    filas.push([archivo, w.name, w.winery, w.varietal].join(";"));
    informe.push(`OK ${id} ← "${p.name}" | ${Math.round(buf.length / 1024)}KB`);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
