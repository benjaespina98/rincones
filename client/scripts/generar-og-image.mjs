/**
 * Genera la imagen de vista previa (Open Graph / Twitter Card): client/public/og-image.jpg, 1200×630.
 *
 *   npm run og:image -w client        (o)   node client/scripts/generar-og-image.mjs
 *
 * Es una composición y no una captura: la pantalla principal de la app pide sesión y, sin ella, queda vacía. Lleva el
 * monograma (el mismo de public/favicon.svg), el nombre y una frase corta, con el fondo de la app. Texto de 40 px o más y
 * margen seguro de 60 px; sin datos de nadie ni marcas de terceros.
 *
 * Usa Playwright (devDependency; no entra al bundle) y pide la fuente Inter a Google Fonts; sin red cae a la del sistema.
 * Sale en JPEG para quedar muy por debajo de los 300 KB que piden WhatsApp y LinkedIn (el PNG de un degradé pesa >380 KB).
 */
import { chromium } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aca = dirname(fileURLToPath(import.meta.url));
const salida = join(aca, "..", "public", "og-image.jpg");
const logo = readFileSync(join(aca, "..", "public", "favicon.svg"), "utf8");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #f4f5f9;
    background:
      radial-gradient(60% 70% at 85% 10%, rgba(167, 130, 239, 0.22), transparent 70%),
      radial-gradient(50% 60% at 8% 100%, rgba(180, 34, 61, 0.20), transparent 70%),
      linear-gradient(160deg, #161923, #0d0e14 70%);
    display: flex; align-items: center; gap: 64px; padding: 60px 60px 60px 96px;
  }
  .logo { width: 292px; height: 292px; flex: none; filter: drop-shadow(0 0 60px rgba(167, 130, 239, 0.35)); }
  .logo svg { width: 100%; height: 100%; display: block; }
  .texto { display: grid; gap: 14px; }
  .kicker { font-size: 40px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #a9a6c4; }
  .nombre { font-size: 148px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
  .frase { font-size: 44px; font-weight: 500; line-height: 1.25; color: #d9cffb; max-width: 640px; }
</style></head><body>
  <div class="logo">${logo}</div>
  <div class="texto">
    <div class="kicker">Bodega personal</div>
    <div class="nombre">Rincones</div>
    <div class="frase">Escaneá la etiqueta y charlá con tu sommelier IA.</div>
  </div>
</body></html>`;

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await pagina.setContent(html, { waitUntil: "networkidle" }).catch(() => pagina.setContent(html));
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: salida, type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: 1200, height: 630 } });
} finally {
  await navegador.close();
}
const kb = Math.round(statSync(salida).size / 1024);
console.log(`og-image.jpg: 1200×630, ${kb} KB`);
if (kb >= 300) {
  console.error("Pesa 300 KB o más: bajá la calidad.");
  process.exit(1);
}
