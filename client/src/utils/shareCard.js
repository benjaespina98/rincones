// La ficha compartible: un vino (y, si hay, una cata) dibujados a mano en un
// <canvas> para salir como imagen de historia (1080×1920).
//
// ── POR QUÉ CANVAS Y NO UNA CAPTURA DE LA PANTALLA ──────────────────────────
// Ninguna pantalla de la app tiene el formato 9:16 de una historia, así que
// "sacarle una foto" al DOM habría significado maquetar una pantalla nueva
// SÓLO para fotografiarla — el doble de CSS por el mismo resultado. Dibujar a
// mano en un canvas de memoria (nunca se cuelga del DOM) es lo mismo que ya
// hace el escáner de etiquetas para comprimir fotos (ver utils/image.js): acá
// se usa esa misma API nativa para COMPONER una, no para achicarla.
//
// ── DE DÓNDE SALEN LOS COLORES ──────────────────────────────────────────────
// Se leen de las variables CSS de la app (`--bg`, `--accent`, `--gold`…) en vez
// de repetirlas en hexadecimal acá: si el día de mañana cambia la paleta, la
// ficha cambia sola. El respaldo hexadecimal es el valor de HOY en
// index.css, para que un fallo leyendo `getComputedStyle` (SSR, un test sin
// DOM) no rompa el dibujo, sólo lo deje con los colores de siempre.

import { WINE_TYPE_LABELS } from "../data/wineReference";
import { OCCASION_LABELS } from "../data/momentOptions";
import { wineDisplayName } from "./wineIdentity";
import { normalizeSearchText } from "./text";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const MARGEN = 84;
const FUENTE = '"Plus Jakarta Sans", "Segoe UI", sans-serif';

const leerColor = (variable, fallback) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  try {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return valor || fallback;
  } catch {
    return fallback;
  }
};

/**
 * Espera a que la tipografía de la app esté lista. Sin esto, el PRIMER
 * dibujo de una sesión (antes de que cualquier otro texto la haya disparado)
 * corre el riesgo de salir con la fuente de reemplazo del sistema — no rompe
 * nada, pero la ficha no se parece a la app que la generó.
 */
const esperarFuente = async () => {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await document.fonts.load(`800 64px ${FUENTE}`);
    await document.fonts.ready;
  } catch {
    // Sin Font Loading API (Safari viejo): se dibuja con lo que haya.
  }
};

/**
 * Carga una imagen para poder dibujarla en el canvas.
 *
 * `crossOrigin = "anonymous"` es deliberado y estricto a propósito: sin él, una
 * imagen sin cabecera CORS SE DIBUJA igual pero "mancha" el canvas — deja de
 * poder exportarse (`toBlob` tira `SecurityError`) y el fallo aparece recién al
 * final, con el dibujo entero ya perdido. Pidiéndolo con CORS, una imagen que
 * no lo soporta falla ACÁ, temprano, donde `buildShareCardCanvas` la puede
 * tratar como "sin foto" y seguir con el resto de la ficha.
 */
const cargarImagen = (src) =>
  new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("Sin imagen"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen de la botella"));
    img.src = src;
  });

/** Envuelve un texto en líneas que entran en `maxWidth`, con la fuente ya puesta en `ctx`. */
const ajustarTexto = (ctx, texto, maxWidth) => {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > maxWidth) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
};

const GLIFOS_ESTRELLAS = "★".repeat(5);

/** Cuánto ocupa la fila de cinco estrellas a este tamaño, para poder centrarla ANTES de dibujarla. */
const medirEstrellas = (ctx, tamanio) => {
  ctx.font = `${tamanio}px ${FUENTE}`;
  return ctx.measureText(GLIFOS_ESTRELLAS).width;
};

/**
 * Las estrellas, dibujadas EXACTAMENTE con la misma técnica que `StarRating`:
 * cinco glifos "★" apagados, y encima los mismos cinco recortados al ancho que
 * corresponde al puntaje. Es lo que hace que media estrella se vea como media
 * estrella acá también, y no redondeada — la misma razón por la que
 * `StarRating` lo hace así (ver el comentario ahí).
 */
const dibujarEstrellas = (ctx, x, y, rating, tamanio, dorado) => {
  const max = 5;
  const valor = Math.max(0, Math.min(Number(rating) || 0, max));
  ctx.font = `${tamanio}px ${FUENTE}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const ancho = ctx.measureText(GLIFOS_ESTRELLAS).width;

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillText(GLIFOS_ESTRELLAS, x, y);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - tamanio, ancho * (valor / max), tamanio * 1.4);
  ctx.clip();
  ctx.fillStyle = dorado;
  ctx.fillText(GLIFOS_ESTRELLAS, x, y);
  ctx.restore();
};

/**
 * Dibuja la ficha en un canvas EN MEMORIA (nunca se agrega al DOM) y lo
 * devuelve. `moment` es opcional: sin él, la ficha es la del vino solo —uva,
 * cosecha, tu puntaje privado si lo tenés— que es lo que hace falta para
 * compartir un vino que todavía no tiene ninguna cata registrada.
 */
export const buildShareCardCanvas = async (wine, moment = null) => {
  await esperarFuente();

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");

  const bg = leerColor("--bg", "#0b0d14");
  const accent = leerColor("--accent", "#7e59c9");
  const gold = leerColor("--gold", "#f2b737");
  const text = leerColor("--text", "#f3f5ff");
  const textSecondary = leerColor("--text-secondary", "#c3bddd");
  const textMuted = leerColor("--text-muted", "#968fb4");

  // Fondo: el mismo violeta de la app, como un resplandor apagándose desde
  // donde va a ir la botella — el mismo espíritu que `.wine-detail-hero__ambient`,
  // pero sin depender de la foto (acá tiene que andar CON o SIN imagen).
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const halo = ctx.createRadialGradient(
    CARD_WIDTH / 2, 560, 40,
    CARD_WIDTH / 2, 560, 820
  );
  halo.addColorStop(0, `${accent}40`);
  halo.addColorStop(1, `${bg}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // La botella. Si no carga —CORS, sin foto todavía, sin red— la ficha sigue
  // sin ella: un texto sin imagen es una ficha más simple, no una que falló.
  let debajoDeImagen = 300;
  try {
    const img = await cargarImagen(wine?.image);
    const maxAncho = CARD_WIDTH - MARGEN * 2;
    const maxAlto = 780;
    const escala = Math.min(maxAncho / img.width, maxAlto / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    const x = (CARD_WIDTH - w) / 2;
    const y = 120;
    ctx.drawImage(img, x, y, w, h);
    debajoDeImagen = y + h;
  } catch {
    debajoDeImagen = 260;
  }

  let cursorY = debajoDeImagen + 110;
  ctx.textAlign = "center";

  // Bodega: chica, en mayúsculas y espaciada — mismo tratamiento que
  // `.wine-detail-identity__winery` en la ficha real.
  if (wine?.winery) {
    ctx.fillStyle = textMuted;
    ctx.font = `800 32px ${FUENTE}`;
    ctx.fillText(wine.winery.toUpperCase(), CARD_WIDTH / 2, cursorY);
    cursorY += 58;
  }

  // El nombre: lo más grande de la ficha, como en cualquier tarjeta de la app.
  const nombre = wineDisplayName(wine) || "Vino sin nombre";
  ctx.fillStyle = text;
  ctx.font = `800 68px ${FUENTE}`;
  const lineasNombre = ajustarTexto(ctx, nombre, CARD_WIDTH - MARGEN * 2);
  for (const linea of lineasNombre.slice(0, 2)) {
    ctx.fillText(linea, CARD_WIDTH / 2, cursorY);
    cursorY += 78;
  }
  cursorY += 16;

  // Uva · cosecha · región, igual que compone `WineMeta`.
  const tipo = wine?.type && wine.type !== "unknown" ? WINE_TYPE_LABELS[wine.type] : "";
  const meta = [tipo, wine?.varietal, wine?.vintage, wine?.region].filter(Boolean).join("   ·   ");
  if (meta) {
    ctx.fillStyle = textSecondary;
    ctx.font = `600 34px ${FUENTE}`;
    ctx.fillText(meta, CARD_WIDTH / 2, cursorY);
    cursorY += 76;
  }

  // El puntaje: el de LA CATA si esta ficha es de una, y si no el del vino.
  const rating = moment?.rating || wine?.rating || 0;
  if (rating > 0) {
    const anchoEstrellas = medirEstrellas(ctx, 58);
    dibujarEstrellas(ctx, (CARD_WIDTH - anchoEstrellas) / 2, cursorY, rating, 58, gold);
    ctx.textAlign = "center";
    cursorY += 96;
  }

  // La reseña, entre comillas, hasta seis renglones — más que eso y la ficha
  // deja de leerse de un vistazo, que es todo lo que dura una historia.
  const reseña = moment?.notes?.trim();
  if (reseña) {
    cursorY += 8;
    ctx.fillStyle = text;
    ctx.font = `italic 500 40px ${FUENTE}`;
    const anchoTexto = CARD_WIDTH - MARGEN * 2 - 60;
    const lineas = ajustarTexto(ctx, `"${reseña}"`, anchoTexto).slice(0, 6);
    for (const linea of lineas) {
      ctx.fillText(linea, CARD_WIDTH / 2, cursorY);
      cursorY += 56;
    }
    cursorY += 10;
  }

  // La ocasión y con quién, si la cata las tiene — el mismo par de datos que
  // muestra `.moment-item__meta` en el diario, dichos en una sola línea.
  const ocasionTexto = [
    moment?.occasion ? OCCASION_LABELS[moment.occasion] : "",
    moment?.companions || "",
    moment?.place || "",
  ].filter(Boolean).join("   ·   ");
  if (ocasionTexto) {
    ctx.fillStyle = textMuted;
    ctx.font = `600 30px ${FUENTE}`;
    ctx.fillText(ocasionTexto, CARD_WIDTH / 2, cursorY);
  }

  // El watermark: pie de página fijo, no importa cuánto texto haya arriba.
  // Sutil a propósito —blanco a media opacidad, sin cápsula ni fondo— porque
  // es una firma, no un anuncio: la ficha es sobre el vino, no sobre la app.
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = `700 30px ${FUENTE}`;
  ctx.fillText("Mi bodega en Rincones", CARD_WIDTH / 2, CARD_HEIGHT - 90);

  return canvas;
};

/** El canvas, exportado como JPEG. Calidad alta: es una foto de una etiqueta
 *  y una historia comprimida de más se ve con bloques alrededor del texto. */
export const canvasToJpegBlob = (canvas, quality = 0.9) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))),
      "image/jpeg",
      quality
    );
  });

/** La ficha entera, lista como `File` para `navigator.share` o para descargar. */
export const buildShareCardFile = async (wine, moment = null) => {
  const canvas = await buildShareCardCanvas(wine, moment);
  const blob = await canvasToJpegBlob(canvas, 0.9);
  const slug = normalizeSearchText(wineDisplayName(wine)).replace(/\s+/g, "-") || "vino";
  return new File([blob], `rincones-${slug}.jpg`, { type: "image/jpeg" });
};
