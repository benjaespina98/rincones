const labelsService = require("../services/labels.service");
const visionService = require("../services/vision.service");
const { composeDisplayName } = require("../data/wineIdentity");

const EMPTY_CONFIDENCE = {
  winery: 0, line: 0, name: 0, varietal: 0, vintage: 0, region: 0, type: 0,
};

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
            winery: v.winery || "",
            line: v.line || "",
            properName: v.name || "",
            varietal: v.varietal || "",
            region: v.region || "",
            type: v.type || "unknown",
            vintage: v.vintage || "",
            // Nombre visible ya compuesto con la convención del catálogo.
            displayName: v.displayName || "",
            isWineLabel: v.isWineLabel,
            confidence: v.confidence,
            source: "gemini",
            rawText: "",
            // Compat: el cliente viejo leía estas dos claves.
            estimatedName: v.displayName || "",
            estimatedVintage: v.vintage || "",
          },
        });
      } catch (visionError) {
        // Si la visión falla (sin key, timeout, error de API), caemos al OCR.
        console.error("Visión (Gemini) falló, usando OCR:", visionError.message);
      }
    }

    // 2) Fallback: OCR local (Tesseract). Devuelve el MISMO sobre que la visión
    // para que el cliente no tenga que saber de qué camino vino: el OCR sólo
    // logra sacar nombre y año, así que el resto va vacío con confianza 0.
    const result = await labelsService.analyzeImageBuffer(req.file.buffer);
    const ocrName = result.estimatedName || "";
    const ocrConf = Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0)));

    return res.status(200).json({
      data: {
        winery: "",
        line: "",
        properName: ocrName,
        varietal: "",
        region: "",
        type: "unknown",
        vintage: result.estimatedVintage || "",
        displayName: composeDisplayName({ name: ocrName }),
        // El OCR no sabe si es una etiqueta de vino; lo damos por bueno y que
        // el usuario confirme en la pantalla de revisión.
        isWineLabel: true,
        confidence: {
          ...EMPTY_CONFIDENCE,
          name: ocrName ? ocrConf : 0,
          vintage: result.estimatedVintage ? ocrConf : 0,
        },
        source: "ocr",
        rawText: result.rawText || "",
        estimatedName: ocrName,
        estimatedVintage: result.estimatedVintage || "",
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeLabel,
};
