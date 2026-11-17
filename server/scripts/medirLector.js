#!/usr/bin/env node
/**
 * Mide el lector de etiquetas con fotos reales, a tres resoluciones.
 *
 * ── ESTADO: ESCRITO Y SIN EJECUTAR (también mide composition, aging y alcohol) ─────────────────────────────────────────────────────────────
 * Hace falta una carpeta con fotos reales de etiquetas, que no están en el repositorio. Cuando
 * haya, este script responde la pregunta que hoy está abierta: ¿2000 px / calidad 0,92 (lo que
 * manda el cliente) es el punto justo, o 1600 o 1280 leen igual y tardan menos?
 *
 * Uso:
 *   GEMINI_API_KEY=... node server/scripts/medirLector.js <carpeta-de-fotos>
 *   FOTOS_DIR=<carpeta> node server/scripts/medirLector.js
 *
 * Qué hace, por cada foto (.jpg .jpeg .png .webp) y por cada lado mayor (1280, 1600, 2000):
 *   1. la redimensiona y la recomprime a JPEG calidad 0,92, como lo hace el cliente;
 *   2. llama a `analyzeWineLabel`, el MISMO lector que usa la app;
 *   3. anota el tiempo, el tamaño del archivo enviado, qué campos leyó, cuáles quedaron vacíos y
 *      la confianza de cada uno.
 * y al final imprime una tabla por foto y los totales por resolución (tiempo medio, tamaño total,
 * campos leídos, confianza media).
 *
 * Reglas:
 *   · No toca ninguna base de datos (no importa mongoose ni los modelos).
 *   · No tiene claves: la de Gemini se lee del entorno, igual que el servidor. No se imprime.
 *   · Cada llamada cuenta contra la cuota de Gemini: 3 resoluciones x N fotos. Con 20 fotos son 60
 *     llamadas. Hay una pausa entre llamadas (PAUSA_MS) para no chocar con el límite por minuto.
 *   · Para redimensionar usa `sharp` SI está instalado. No es una dependencia del proyecto; para
 *     correr esta medición alcanza con `npm install --no-save sharp` y no deja rastro en el
 *     package.json. Sin `sharp`, el script avisa y termina.
 *
 * Variables opcionales: LADOS=1280,1600,2000  CALIDAD=92  PAUSA_MS=1500
 */
const fs = require("fs");
const path = require("path");

// Los datos de elaboración (composition, aging, alcohol) sólo están en etiquetas que los traen: un vacío ahí puede ser
// correcto. Se miden igual para ver cuántas veces los lee cuando sí están.
const CAMPOS = ["winery", "line", "name", "varietal", "vintage", "region", "type", "composition", "aging", "alcohol"];
const LADOS = (process.env.LADOS || "1280,1600,2000").split(",").map(Number).filter(Boolean);
const CALIDAD = Number(process.env.CALIDAD || 92);
const PAUSA_MS = Number(process.env.PAUSA_MS || 1500);
const EXTENSIONES = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const cargarSharp = () => {
  try {
    return require("sharp");
  } catch {
    return null;
  }
};

const leido = (valor) => valor !== undefined && valor !== null && valor !== "" && valor !== "unknown" && valor !== 0;

const main = async () => {
  const carpeta = process.argv[2] || process.env.FOTOS_DIR;
  if (!carpeta) {
    console.error("Falta la carpeta de fotos: node server/scripts/medirLector.js <carpeta>  (o FOTOS_DIR)");
    process.exit(1);
  }
  if (!fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
    console.error(`No existe la carpeta: ${carpeta}`);
    process.exit(1);
  }
  const sharp = cargarSharp();
  if (!sharp) {
    console.error("Falta `sharp` para redimensionar. Instalalo sin tocar el proyecto: npm install --no-save sharp");
    process.exit(1);
  }
  const { analyzeWineLabel, isVisionConfigured } = require("../src/services/vision.service");
  if (!isVisionConfigured()) {
    console.error("El lector no está configurado: falta la clave de Gemini en el entorno.");
    process.exit(1);
  }

  const fotos = fs
    .readdirSync(carpeta)
    .filter((f) => EXTENSIONES.has(path.extname(f).toLowerCase()))
    .sort();
  if (!fotos.length) {
    console.error("La carpeta no tiene fotos (.jpg .jpeg .png .webp).");
    process.exit(1);
  }
  console.log(`${fotos.length} fotos x ${LADOS.length} resoluciones = ${fotos.length * LADOS.length} llamadas a Gemini\n`);

  const filas = [];
  for (const foto of fotos) {
    const original = fs.readFileSync(path.join(carpeta, foto));
    for (const lado of LADOS) {
      const enviado = await sharp(original)
        .rotate()
        .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: CALIDAD })
        .toBuffer();
      const t0 = process.hrtime.bigint();
      let lectura = null;
      let error = "";
      try {
        lectura = await analyzeWineLabel(enviado, "image/jpeg");
      } catch (e) {
        error = e.message || String(e);
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const leidos = lectura ? CAMPOS.filter((c) => leido(lectura[c])) : [];
      const vacios = lectura ? CAMPOS.filter((c) => !leido(lectura[c])) : CAMPOS;
      const confianzas = lectura ? leidos.map((c) => lectura.confidence?.[c] ?? 0) : [];
      filas.push({ foto, lado, ms, bytes: enviado.length, leidos, vacios, confianza: media(confianzas), lectura, error });
      console.log(
        `${foto.padEnd(28)} ${String(lado).padStart(4)}px  ${(enviado.length / 1024).toFixed(0).padStart(5)} kB  ` +
          `${(ms / 1000).toFixed(1).padStart(5)} s  leídos ${leidos.length}/${CAMPOS.length}  conf ${media(confianzas).toFixed(0).padStart(3)}  ` +
          (error ? `ERROR: ${error}` : vacios.length ? `vacíos: ${vacios.join(",")}` : "")
      );
      await dormir(PAUSA_MS);
    }
  }

  console.log("\n── Por resolución ──");
  console.log("lado    tiempo medio   tamaño total   campos leídos (media)   confianza media   errores");
  for (const lado of LADOS) {
    const f = filas.filter((x) => x.lado === lado);
    const ok = f.filter((x) => !x.error);
    console.log(
      `${String(lado).padStart(4)}px  ${(media(ok.map((x) => x.ms)) / 1000).toFixed(1).padStart(8)} s   ` +
        `${(f.reduce((a, x) => a + x.bytes, 0) / 1024 / 1024).toFixed(1).padStart(9)} MB   ` +
        `${media(ok.map((x) => x.leidos.length)).toFixed(1).padStart(10)} / ${CAMPOS.length}           ` +
        `${media(ok.map((x) => x.confianza)).toFixed(0).padStart(8)}          ${f.length - ok.length}`
    );
  }
  console.log("\nLeer: si 1600 lee los mismos campos con la misma confianza que 2000 y tarda menos, bajar SCAN_MAX_DIM en LabelScanner.jsx.");
  console.log("Recordá: la calidad de lectura depende de las fotos. Medir con etiquetas dorado sobre dorado, cursiva, brillo y letra chica.");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
