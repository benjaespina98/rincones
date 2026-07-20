const labelsService = require("../services/labels.service");
const visionService = require("../services/vision.service");

const analyzeLabel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Falta archivo de imagen" });
    }

    // 1) Preferimos visión (Gemini): más rápido y preciso que el OCR.
    if (visionService.isVisionConfigured()) {
      try {
        const v = await visionService.analyzeWineLabel(req.file.buffer, req.file.mimetype);
        return res.status(200).json({
          data: {
            estimatedName: v.name || "",
            estimatedVintage: v.vintage || "",
            winery: v.winery || "",
            varietal: v.varietal || "",
            region: v.region || "",
            type: v.type || "unknown",
            isWineLabel: v.isWineLabel,
            // Confianza orientativa para la UI: alta si reconoció una etiqueta.
            confidence: v.isWineLabel ? 92 : 25,
            source: "gemini",
            rawText: "",
          },
        });
      } catch (visionError) {
        // Si la visión falla (sin key, timeout, error de API), caemos al OCR.
        console.error("Visión (Gemini) falló, usando OCR:", visionError.message);
      }
    }

    // 2) Fallback: OCR local (Tesseract).
    const result = await labelsService.analyzeImageBuffer(req.file.buffer);
    return res.status(200).json({ data: { ...result, source: "ocr" } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeLabel,
};
