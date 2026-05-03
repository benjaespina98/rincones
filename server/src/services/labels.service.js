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
    .filter((l) => !/^(19|20)\d{2}$/.test(l));
  if (lines.length === 0) return "";
  // prefer the longest line as the probable label
  lines.sort((a, b) => b.length - a.length);
  return lines[0];
};

const analyzeImageBuffer = async (buffer) => {
  const worker = createWorker({ logger: () => {} });
  try {
    await worker.load();
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

    // basic analysis heuristics
    const analysis = {
      hasVintage: !!parsedVintage,
      estimatedName: parsedName,
      estimatedVintage: parsedVintage,
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
