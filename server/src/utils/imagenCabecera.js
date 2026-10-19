/**
 * Qué es de verdad un archivo de imagen, leído de su cabecera, sin dependencias.
 *
 * El `mimetype` que llega en la subida lo escribe el cliente: es lo que DICE ser el archivo, no lo
 * que es. Acá se mira el contenido: los primeros bytes (la "firma" de cada formato) y, del propio
 * encabezado, el ancho y el alto. Con eso el servidor puede rechazar un archivo que no es una
 * imagen, una foto absurdamente grande (decodificarla gasta memoria) o una demasiado chica para
 * leer una etiqueta, ANTES de gastar una llamada al modelo.
 *
 * Formatos: JPEG, PNG, WebP y HEIC/HEIF (el de la cámara de iPhone). Para HEIC el ancho y el alto
 * salen de la caja `ispe`; si no aparece, el archivo se acepta por su firma y las dimensiones
 * quedan en `null` (no se rechaza lo que no se puede medir).
 *
 * Devuelve `{ type, mime, width, height }` o `null` si no es una imagen soportada.
 */

const TIPOS = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

const esJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const esPng = (b) =>
  b.length > 24 &&
  b[0] === 0x89 &&
  b[1] === 0x50 &&
  b[2] === 0x4e &&
  b[3] === 0x47 &&
  b[4] === 0x0d &&
  b[5] === 0x0a &&
  b[6] === 0x1a &&
  b[7] === 0x0a;

const esWebp = (b) =>
  b.length > 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";

const MARCAS_HEIC = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const esHeic = (b) => b.length > 12 && b.toString("latin1", 4, 8) === "ftyp" && MARCAS_HEIC.has(b.toString("latin1", 8, 12));

// Los marcadores SOF (start of frame) de un JPEG llevan el alto y el ancho.
const dimensionesJpeg = (b) => {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marcador = b[i + 1];
    // Relleno (0xFF 0xFF) o marcadores sin largo: se avanza de a uno.
    if (marcador === 0xff || marcador === 0x00 || (marcador >= 0xd0 && marcador <= 0xd8) || marcador === 0x01) {
      i += marcador === 0xff ? 1 : 2;
      continue;
    }
    const largo = b.readUInt16BE(i + 2);
    const esSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (esSof) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    if (largo < 2) return null;
    i += 2 + largo;
  }
  return null;
};

const dimensionesPng = (b) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

const dimensionesWebp = (b) => {
  const formato = b.toString("latin1", 12, 16);
  if (formato === "VP8 " && b.length > 30) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (formato === "VP8L" && b.length > 25) {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (formato === "VP8X" && b.length > 29) {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
};

// En HEIC el tamaño vive en la caja "ispe": 4 bytes de versión y banderas, ancho (4) y alto (4).
const dimensionesHeic = (b) => {
  const i = b.indexOf("ispe", 0, "latin1");
  if (i < 0 || i + 16 > b.length) return null;
  return { width: b.readUInt32BE(i + 8), height: b.readUInt32BE(i + 12) };
};

const detectarImagen = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  try {
    if (esJpeg(buffer)) return { type: "jpeg", mime: TIPOS.jpeg, ...(dimensionesJpeg(buffer) || { width: null, height: null }) };
    if (esPng(buffer)) return { type: "png", mime: TIPOS.png, ...dimensionesPng(buffer) };
    if (esWebp(buffer)) return { type: "webp", mime: TIPOS.webp, ...(dimensionesWebp(buffer) || { width: null, height: null }) };
    if (esHeic(buffer)) return { type: "heic", mime: TIPOS.heic, ...(dimensionesHeic(buffer) || { width: null, height: null }) };
  } catch {
    // Una cabecera truncada o corrupta que se sale del buffer: no es una imagen que se pueda leer.
    return null;
  }
  return null;
};

/** Límites de una foto de etiqueta: ni miniaturas ilegibles ni fotos que explotan la memoria. */
const LIMITES = {
  ladoMinimo: 200, // px del lado MÁS CHICO: por debajo no hay letra que leer
  ladoMaximo: 12000, // px del lado más grande
  pixelesMaximos: 64_000_000, // 64 megapíxeles
};

/**
 * Valida una subida. Devuelve `{ ok: true, info }` o `{ ok: false, motivo, mensaje }`.
 * Los mensajes están pensados para mostrarse tal cual.
 */
const validarImagen = (buffer, limites = LIMITES, { exigirMedidas = true } = {}) => {
  const info = detectarImagen(buffer);
  if (!info) {
    return { ok: false, motivo: "formato", mensaje: "El archivo no es una foto válida. Probá con otra." };
  }
  const { width, height } = info;
  // JPEG y PNG siempre se pueden medir: si no, la cabecera está rota o armada para esquivar los límites.
  if (exigirMedidas && (info.type === "jpeg" || info.type === "png") && (width === null || height === null)) {
    return { ok: false, motivo: "corrupta", mensaje: "La foto está dañada. Probá sacarla de nuevo." };
  }
  if (width !== null && height !== null) {
    if (!(width > 0 && height > 0)) {
      return { ok: false, motivo: "corrupta", mensaje: "La foto está dañada. Probá sacarla de nuevo." };
    }
    if (Math.min(width, height) < limites.ladoMinimo) {
      return { ok: false, motivo: "chica", mensaje: "La foto es muy chica para leer la etiqueta. Acercate y sacala de nuevo." };
    }
    if (Math.max(width, height) > limites.ladoMaximo || width * height > limites.pixelesMaximos) {
      return { ok: false, motivo: "grande", mensaje: "La foto es demasiado grande. Probá con una de menor resolución." };
    }
  }
  return { ok: true, info };
};

module.exports = { detectarImagen, validarImagen, LIMITES };
