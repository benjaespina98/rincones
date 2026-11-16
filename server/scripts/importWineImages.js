// Carga masiva al pool de fotos ("stock") de WineImage.
//
// El pool es el mismo que llena el escaneo normal (ver
// src/services/wineImages.service.js): una foto por vino, identificada por
// nombre + bodega + varietal, que se le presta a cualquiera que cargue o
// busque ese vino sin foto propia. Esto es la puerta de atrás para poblarlo
// a mano con fotos que alguien buscó y bajó, en vez de esperar a que cada
// vino llegue por una etiqueta escaneada.
//
// ── CÓMO SE ARMA EL LOTE ─────────────────────────────────────────────────
// Una carpeta con las imágenes y un manifiesto `manifest.csv` adentro, con
// una fila por foto:
//
//   archivo;nombre;bodega;varietal
//   catena-malbec.jpg;Catena Malbec;Catena Zapata;Malbec
//   rutini-cabernet.jpg;Rutini Cabernet Franc;Rutini;Cabernet Franc
//
// - `archivo` es el nombre del archivo dentro de la misma carpeta.
// - `varietal` puede ir vacío si no se sabe (el vino igual entra al pool,
//   pero conviene completarlo: la clave lo incluye, así que sin varietal
//   dos vinos de la misma línea pueden terminar compartiendo o no la foto
//   según coincida el resto).
// - El separador es `;` a propósito: los nombres de vino traen comas.
//
// ── QUÉ HACE Y QUÉ NO ─────────────────────────────────────────────────────
// Respeta la regla del pool: la primera foto que llega para un vino se
// queda. Si la clave ya tiene foto, esta fila se salta (se lista al final,
// no se pisa nada). Para reemplazar una foto existente hay que hacerlo
// desde la app (ahí sí, sólo quien la subió puede reemplazarla) o con
// --force acá, a sabiendas de que pisa lo que haya.
//
//   npm run import:images -- --dir=./fotos --dry     ver qué haría, sin tocar nada
//   npm run import:images -- --dir=./fotos           cargar
//   npm run import:images -- --dir=./fotos --force    pisar las que ya existen

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const WineImage = require("../src/models/wineImage.model");
const imageStorage = require("../src/services/imageStorage.service");
const { poolKey } = require("../src/data/wineIdentity");

dotenv.config();

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dryRun = args.includes("--dry") || args.includes("--dry-run");
const force = args.includes("--force");
// Puntaje de calidad (0-100) con el que entran las fotos del lote. La tarjeta de Descubrí sólo muestra
// fotos del pool con puntaje >= 70 (las «no evaluadas» no): una foto cargada a mano por quien la
// eligió y bajó —en general la foto oficial de producto— es de lo mejor que hay, así que por defecto
// entra con 90. Se puede cambiar con --calidad=NN.
const calidad = Number(flag("calidad")) || 90;

const EXTENSIONES_VALIDAS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const parseManifest = (contenido) => {
  const lineas = contenido
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lineas.length === 0) return [];

  const [cabecera, ...filas] = lineas;
  const columnas = cabecera.split(";").map((c) => c.trim().toLowerCase());
  const idx = (col) => columnas.indexOf(col);
  const iArchivo = idx("archivo");
  const iNombre = idx("nombre");
  const iBodega = idx("bodega");
  const iVarietal = idx("varietal");

  if (iArchivo === -1 || iNombre === -1 || iBodega === -1) {
    throw new Error(
      "manifest.csv necesita al menos las columnas archivo;nombre;bodega (varietal es opcional)"
    );
  }

  return filas.map((linea, i) => {
    const campos = linea.split(";");
    return {
      fila: i + 2, // +2: la cabecera es la línea 1, y las filas son 1-based
      archivo: (campos[iArchivo] || "").trim(),
      nombre: (campos[iNombre] || "").trim(),
      bodega: (campos[iBodega] || "").trim(),
      varietal: iVarietal !== -1 ? (campos[iVarietal] || "").trim() : "",
    };
  });
};

const run = async () => {
  const dir = flag("dir");
  if (!dir) {
    console.error(
      "Falta --dir=<carpeta>. Ejemplo: npm run import:images -- --dir=./fotos --dry"
    );
    process.exit(1);
  }

  const carpeta = path.resolve(dir);
  const manifestPath = path.join(carpeta, "manifest.csv");

  if (!fs.existsSync(manifestPath)) {
    console.error(`No encuentro ${manifestPath}. Ver el encabezado del script para el formato.`);
    process.exit(1);
  }

  const filas = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  if (filas.length === 0) {
    console.log("manifest.csv no tiene filas. Nada para hacer.");
    process.exit(0);
  }

  if (!dryRun && !imageStorage.isConfigured()) {
    console.warn(
      "Cloudinary no está configurado en este .env: las fotos se guardarían como base64 " +
        "adentro de Mongo (pesado). Configurá CLOUDINARY_URL antes de correr sin --dry."
    );
  }

  if (!dryRun) await connectToDatabase();

  const resultado = { cargadas: 0, saltadas: [], errores: [] };

  for (const fila of filas) {
    const { archivo, nombre, bodega, varietal, fila: numFila } = fila;

    if (!archivo || !nombre || !bodega) {
      resultado.errores.push(`Fila ${numFila}: falta archivo, nombre o bodega`);
      continue;
    }

    const ext = path.extname(archivo).toLowerCase();
    if (!EXTENSIONES_VALIDAS.has(ext)) {
      resultado.errores.push(`Fila ${numFila}: "${archivo}" no es jpg/png/webp`);
      continue;
    }

    const rutaImagen = path.join(carpeta, archivo);
    if (!fs.existsSync(rutaImagen)) {
      resultado.errores.push(`Fila ${numFila}: no existe el archivo "${archivo}"`);
      continue;
    }

    const key = poolKey(nombre, bodega, varietal);
    if (!key) {
      resultado.errores.push(`Fila ${numFila}: "${nombre}" no arma una clave válida (¿nombre muy corto?)`);
      continue;
    }

    if (!dryRun) {
      const existente = await WineImage.findOne({ key }).select("_id").lean();
      if (existente && !force) {
        resultado.saltadas.push(`${nombre} (${bodega}) — ya tiene foto, usá --force para pisarla`);
        continue;
      }

      const url = await imageStorage.store(rutaImagen, { folder: "rincones/wines" });
      await WineImage.updateOne(
        { key },
        {
          $set: { image: url, name: nombre.trim(), winery: bodega.trim(), qualityScore: calidad },
          $setOnInsert: { key },
        },
        { upsert: true }
      );
    }

    resultado.cargadas += 1;
    console.log(`${dryRun ? "[dry] " : ""}${nombre} (${bodega}) → clave "${key}"`);
  }

  console.log(`\n${resultado.cargadas} foto(s) ${dryRun ? "para cargar" : "cargadas"}.`);
  if (resultado.saltadas.length) {
    console.log(`\n${resultado.saltadas.length} salteada(s) (ya tenían foto):`);
    resultado.saltadas.forEach((s) => console.log(`  - ${s}`));
  }
  if (resultado.errores.length) {
    console.log(`\n${resultado.errores.length} con error:`);
    resultado.errores.forEach((e) => console.log(`  - ${e}`));
  }

  process.exit(resultado.errores.length > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error("Error al importar:", error.message);
  process.exit(1);
});
