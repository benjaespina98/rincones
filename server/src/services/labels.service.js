// Requerida perezosamente (ver más abajo, en `analyzeImageBuffer`): este módulo
// se importa al arrancar el server —`app.js` monta todas las rutas de una,
// no sólo las que se van a usar— así que un `require` de nivel de módulo acá
// cargaba tesseract.js (OCR + wasm, pesado) en CADA arranque en frío de la
// función serverless, para CUALQUIER request, aunque fuera un simple listado
// de la bodega que nunca toca este archivo. Y encima casi nunca hace falta:
// es sólo el fallback cuando Gemini no está configurado o falla (ver
// labels.controller.js). Cargarlo recién al primer uso saca ese costo del
// arranque para el resto de la app.
let tesseract = null;
const getTesseract = () => {
  if (!tesseract) tesseract = require("tesseract.js");
  return tesseract;
};

const tryParseVintage = (text) => {
  if (!text) return null;
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
};

const simpleNameFromOcr = (text) => {
  if (!text) return "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // los años sueltos no son el nombre del vino
    .filter((l) => !/^(19|20)\d{2}$/.test(l))
    // descartar líneas demasiado cortas (iniciales, ruido de OCR)
    .filter((l) => l.replace(/[^a-zA-Z0-9]/g, "").length >= 3);

  if (lines.length === 0) return "";
  // las etiquetas suelen imprimir el nombre del vino/bodega arriba de todo
  return lines[0];
};

const analyzeImageBuffer = async (buffer) => {
  const { createWorker } = getTesseract();
  const worker = await createWorker({ logger: () => {} });
  try {
    // try spanish then english
    try {
      await worker.loadLanguage("spa");
      await worker.initialize("spa");
    } catch (err) {
      await worker.loadLanguage("eng");
      await worker.initialize("eng");
    }

    const { data } = await worker.recognize(buffer);
    const text = data?.text || "";
    const parsedVintage = tryParseVintage(text);
    const parsedName = simpleNameFromOcr(text);

    // Confianza global del OCR (0-100) que reporta Tesseract.
    const confidence = Math.max(0, Math.min(100, Math.round(Number(data?.confidence) || 0)));

    // basic analysis heuristics
    const analysis = {
      hasVintage: !!parsedVintage,
      estimatedName: parsedName,
      estimatedVintage: parsedVintage,
      confidence,
      rawText: text,
    };

    return analysis;
  } finally {
    try {
      await worker.terminate();
    } catch (e) {}
  }
};

module.exports = {
  analyzeImageBuffer,
};
