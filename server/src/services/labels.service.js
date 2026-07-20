const { createWorker } = require("tesseract.js");

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
