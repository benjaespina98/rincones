// Descarga las fotos de botella de Zuccardi desde su sitio (zuccardiwines.com) y arma el manifest.csv que lee
// importWineImages.js. Las páginas «Vinos de región / pueblo / paraje / viticultor» traen un PNG de producto por
// etiqueta, con fondo transparente. Los «vinos de finca» y de parcela sólo tienen fotos de ambiente: no se usan.
//
//   node scripts/descargarFotosZuccardi.js --out=./fotos-zuccardi
//   node scripts/recortarFondoBlanco.js --in=./fotos-zuccardi --out=./fotos-zuccardi-recortadas   (sólo ajusta el margen)
//   npm run import:images -- --dir=./fotos-zuccardi-recortadas --dry
//
// - 1,2 s entre pedidos. El robots.txt permite a los demás bots y sólo bloquea una lista de bots de IA, entre los
//   que no está este (y esto no entrena nada: baja la foto de cada botella para mostrarla con su crédito).
// - Las fotos son de la bodega, sin licencia abierta: se muestran con su crédito.
// - Sin foto de producto en el sitio: Santa Julia, Fuzión, Finca Piedra Infinita y Aluvional (sólo las cuatro juntas).
// - Los PNG traen mucho margen transparente: recortarFondoBlanco.js los ajusta a la botella.
const fs = require("fs");
const path = require("path");
const out = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || "./fotos-zuccardi");
fs.mkdirSync(out, { recursive: true });
const { CATALOG } = require("../src/data/argentineWines");
// [página, archivo de la foto, id del catálogo (sin «ar-») | {name, winery, varietal}]
const FILAS = [
  ["vinos-de-region", "1.zuccardi-seria-a-torrontes.png", "familia-zuccardi-zuccardi-serie-a-torrontes"],
  // OJO: en el sitio los nombres de archivo de Serie A están cruzados. «4.zuccardi-serie-a-malbec.png» muestra la
  // etiqueta BONARDA y «3.zuccardi-serie-a-bonarda.png» la de MALBEC (verificado mirando las etiquetas).
  ["vinos-de-region", "3.zuccardi-serie-a-bonarda.png", "familia-zuccardi-zuccardi-serie-a-malbec"],
  ["vinos-de-region", "4.zuccardi-serie-a-malbec.png", "familia-zuccardi-zuccardi-serie-a-bonarda"],
  // Cómo lo carga la gente a mano: el nombre lleva la uva.
  ["vinos-de-region", "4.zuccardi-serie-a-malbec.png", { name: "Zuccardi Serie A Bonarda", winery: "Familia Zuccardi", varietal: "Bonarda" }],
  ["vinos-de-region", "2.-zuccardi-q-malbec.png", "familia-zuccardi-zuccardi-q-malbec"],
  ["vinos-de-region", "3.zuccardi-1-cabernet-franc.png", "familia-zuccardi-zuccardi-q-cabernet-franc"],
  ["vinos-de-region", "4.-zuccardi-q-cabernet-sauvignon.png", "familia-zuccardi-zuccardi-q-cabernet-sauvignon"],
  ["vinos-de-pueblo", "Zuccardi-Poligonos-San-Pablo-Malbec-w.png", "familia-zuccardi-zuccardi-poligonos-malbec"],
  ["vinos-de-paraje", "1.fosil_.png", "zuccardi-valle-de-uco-zuccardi-fosil-chardonnay"],
  // «aluvional-4.png» muestra las cuatro botellas juntas, no una: no se usa.
  ["vinos-de-viticultor", "1.viticultor-emma-zuccardi.png", "familia-zuccardi-emma-zuccardi-bonarda"],
  ["vinos-de-viticultor", "2.viticultor-tito-zuccardi.png", "familia-zuccardi-tito-zuccardi-blend"],
  ["vinos-de-viticultor", "4.viticultor-concreto.png", "familia-zuccardi-zuccardi-concreto-malbec"],
  ["vinos-de-viticultor", "5.viticultor-jose-zuccardi.png", "familia-zuccardi-jose-zuccardi-malbec"],
];
const UA = "Mozilla/5.0 (compatible; rincones-research/1.0)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const filas = ["archivo;nombre;bodega;varietal"];
  const informe = [];
  const paginas = new Map();
  let n = 0;
  for (const [pagina, archivo, quien] of FILAS) {
    let identidad;
    if (typeof quien === "string") {
      const w = CATALOG.find((x) => x.id === "ar-" + quien);
      if (!w) { informe.push(`SIN CATALOGO ${quien}`); continue; }
      identidad = { name: w.name, winery: w.winery, varietal: w.varietal };
    } else identidad = quien;
    try {
      if (!paginas.has(pagina)) {
        paginas.set(pagina, await (await fetch(`https://zuccardiwines.com/es/vinos/${pagina}/`, { headers: { "User-Agent": UA } })).text());
        await esperar(1200);
      }
      const img = [...paginas.get(pagina).matchAll(/https:\/\/zuccardiwines\.com\/wp-content\/uploads\/[^"'\s)\\]+\.(?:png|jpe?g|webp)/gi)]
        .map((m) => m[0])
        .find((u) => u.endsWith("/" + archivo));
      if (!img) { informe.push(`NO ESTA ${pagina}/${archivo}`); continue; }
      const r = await fetch(img, { headers: { "User-Agent": UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) { informe.push(`FALLO ${archivo} ${r.status}`); continue; }
      n += 1;
      const nombreArchivo = `${String(n).padStart(2, "0")}__${archivo.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      fs.writeFileSync(path.join(out, nombreArchivo), buf);
      filas.push([nombreArchivo, identidad.name, identidad.winery, identidad.varietal].join(";"));
      informe.push(`OK ${archivo} → ${identidad.name} | ${identidad.varietal} | ${Math.round(buf.length / 1024)}KB`);
    } catch (e) { informe.push(`ERROR ${archivo} ${e.message}`); }
    await esperar(1200);
  }
  fs.writeFileSync(path.join(out, "manifest.csv"), filas.join("\n") + "\n");
  console.log(informe.join("\n"));
})();
