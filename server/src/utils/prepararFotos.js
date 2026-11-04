/**
 * La parte tediosa de cargar fotos reales de vinos en lote: saber QUÉ vinos faltan, nombrar los archivos y revisar
 * la carpeta ANTES de importarla. Es lógica pura (sin base de datos, sin red, sin escribir nada): la usa el script
 * `scripts/prepararFotos.js` y la prueban los tests.
 *
 * Es el paso previo a `scripts/importWineImages.js`, que es el que de verdad sube las fotos al pool. Acá se arma
 * el `manifest.csv` con todos los vinos del catálogo (y un nombre de archivo sugerido para cada foto) y se chequea
 * que lo que se junte en la carpeta sirva: que sea una foto de verdad, de tamaño decente, que el vino exista en el
 * catálogo y que no haya dos fotos para el mismo vino.
 *
 * Qué NO hace: no consigue fotos. De dónde salen es una decisión de quien las junta (permiso de la bodega, fotos
 * propias): una foto de producto casi siempre tiene dueño.
 */

const { CATALOG, fold } = require("../data/argentineWines");
const { poolKey } = require("../data/wineIdentity");
const { detectarImagen } = require("./imagenCabecera");

/** Debajo de este lado menor una foto pública se ve blanda en una tarjeta de teléfono. */
const LADO_MINIMO_RECOMENDADO = 500;
/** Más pesada que esto es una foto sin optimizar: se sube igual, pero conviene avisar. */
const PESO_MAXIMO_RECOMENDADO = 3 * 1024 * 1024;

/** Un nombre de archivo estable y sin tildes ni espacios: `catena-zapata_catena-alta_malbec.jpg`. */
const archivoSugerido = ({ winery, name, varietal }) => {
  const trozo = (t) =>
    fold(String(t || ""))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${[trozo(winery), trozo(name), trozo(varietal)].filter(Boolean).join("_")}.jpg`;
};

/** Cada vino distinto del catálogo, una sola vez (por la misma clave que usa el pool de fotos). */
const vinosDelCatalogo = () => {
  const vistos = new Map();
  for (const w of CATALOG) {
    const key = poolKey(w.name, w.winery, w.varietal);
    if (key && !vistos.has(key)) vistos.set(key, { name: w.name, winery: w.winery, varietal: w.varietal, key });
  }
  return [...vistos.values()];
};

/** El `manifest.csv` que espera `importWineImages.js` (separador `;`, porque los nombres de vino traen comas). */
const armarManifest = (vinos = vinosDelCatalogo()) => {
  const limpio = (t) => String(t || "").replace(/[;\r\n]+/g, " ").trim();
  const filas = [...vinos]
    .sort((a, b) => `${a.winery}${a.name}`.localeCompare(`${b.winery}${b.name}`, "es"))
    .map((w) => [archivoSugerido(w), limpio(w.name), limpio(w.winery), limpio(w.varietal)].join(";"));
  return ["archivo;nombre;bodega;varietal", ...filas].join("\n") + "\n";
};

/**
 * Revisa una carpeta ya leída. No toca el disco: recibe lo que hay.
 *
 * @param {Array<{archivo: string, nombre: string, bodega: string, varietal: string}>} filas  las del manifest.
 * @param {Map<string, Buffer>} archivos  nombre de archivo -> contenido, de todo lo que hay en la carpeta.
 * @returns {{ok: Array, errores: Array<{fila:number, archivo:string, motivo:string}>, avisos: Array<{fila:number, archivo:string, motivo:string}>, sinFila: string[], sinFoto: number}}
 */
const evaluarCarpeta = (filas, archivos, catalogo = vinosDelCatalogo()) => {
  const clavesDelCatalogo = new Set(catalogo.map((v) => v.key));
  const ok = [];
  const errores = [];
  const avisos = [];
  const usados = new Set();
  const porClave = new Map();
  let sinFoto = 0;

  filas.forEach((f, i) => {
    const fila = f.fila ?? i + 2;
    const error = (motivo) => errores.push({ fila, archivo: f.archivo, motivo });
    const aviso = (motivo) => avisos.push({ fila, archivo: f.archivo, motivo });

    const buffer = archivos.get(f.archivo);
    if (!f.archivo || !buffer) {
      // Una fila del catálogo sin foto todavía NO es un error: es lo que falta cargar.
      sinFoto += 1;
      return;
    }
    usados.add(f.archivo);

    const key = poolKey(f.nombre, f.bodega, f.varietal);
    if (!key) return error("faltan nombre o bodega: no se puede identificar el vino");
    if (!clavesDelCatalogo.has(key)) aviso("no coincide con ningún vino del catálogo (¿errata en el nombre, la bodega o la uva?)");

    const info = detectarImagen(buffer);
    if (!info) return error("no es una imagen válida (JPG, PNG o WebP)");
    if (info.type === "heic") return error("HEIC no se sirve en la web: convertila a JPG o WebP");

    if (porClave.has(key)) return error(`ya hay otra foto para este vino (fila ${porClave.get(key)})`);
    porClave.set(key, fila);

    const { width, height } = info;
    if (width && height) {
      if (Math.min(width, height) < LADO_MINIMO_RECOMENDADO) aviso(`baja resolución (${width}×${height}): se va a ver blanda`);
      if (width > height) aviso(`foto horizontal (${width}×${height}): una botella se ve mejor vertical`);
    }
    if (buffer.length > PESO_MAXIMO_RECOMENDADO) aviso(`pesa ${(buffer.length / 1048576).toFixed(1)} MB: conviene optimizarla`);

    ok.push({ fila, archivo: f.archivo });
  });

  const sinFila = [...archivos.keys()].filter((a) => a !== "manifest.csv" && !usados.has(a) && /\.(jpe?g|png|webp|heic)$/i.test(a));
  return { ok, errores, avisos, sinFila, sinFoto };
};

const COLUMNAS_DEL_MANIFEST = ["archivo", "nombre", "bodega", "varietal"];

/**
 * Lee el texto de un `manifest.csv` (el que arma `armarManifest`, quizá retocado a mano o guardado desde Excel).
 *
 * Tiene que tolerar lo que hace Excel al guardar un "CSV UTF-8": una marca de orden de bytes (BOM) delante de la
 * cabecera y saltos de línea CRLF. Sin sacar el BOM, la primera columna dejaba de llamarse «archivo», todas las filas
 * salían sin archivo y el script terminaba en verde diciendo «0 fotos válidas»: un falso verde silencioso. Si falta
 * una columna, falla fuerte y dice cuál.
 */
const parsearManifest = (texto) => {
  const lineas = String(texto || "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) throw new Error("El manifest está vacío.");

  const [cabecera, ...resto] = lineas;
  const columnas = cabecera.split(";").map((c) => c.trim().toLowerCase());
  const faltan = COLUMNAS_DEL_MANIFEST.filter((c) => !columnas.includes(c));
  if (faltan.length) throw new Error(`Al manifest le faltan columnas: ${faltan.join(", ")}.`);

  const col = (campos, nombre) => (campos[columnas.indexOf(nombre)] || "").trim();
  return resto.map((l, i) => {
    const campos = l.split(";");
    return {
      fila: i + 2,
      archivo: col(campos, "archivo"),
      nombre: col(campos, "nombre"),
      bodega: col(campos, "bodega"),
      varietal: col(campos, "varietal"),
    };
  });
};

module.exports = {
  archivoSugerido,
  vinosDelCatalogo,
  armarManifest,
  parsearManifest,
  evaluarCarpeta,
  LADO_MINIMO_RECOMENDADO,
  PESO_MAXIMO_RECOMENDADO,
};
