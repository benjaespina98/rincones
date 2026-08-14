const crypto = require("crypto");
const labelsService = require("../services/labels.service");
const visionService = require("../services/vision.service");
const { composeDisplayName } = require("../data/wineIdentity");
const LabelScanCache = require("../models/labelScanCache.model");

const EMPTY_CONFIDENCE = {
  winery: 0, line: 0, name: 0, varietal: 0, vintage: 0, region: 0, type: 0,
};

// Caché por hash exacto del archivo. Ver labelScanCache.model.js: cubre el
// mismo archivo subido más de una vez (reintento tras timeout, la misma foto
// compartida entre dos personas), no fotos distintas de la misma botella.
const HASH_CACHE_DAYS = 30;

const hashBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// Nunca lanza: el caché es una optimización, no un requisito. Ver el mismo
// criterio en catalog.service.js (searchWithAiCached).
const getCachedAnalysis = async (hash) => {
  try {
    const cached = await LabelScanCache.findOne({ hash }).lean();
    return cached?.data || null;
  } catch {
    return null;
  }
};

const saveCachedAnalysis = async (hash, data) => {
  try {
    const expiresAt = new Date(Date.now() + HASH_CACHE_DAYS * 24 * 60 * 60 * 1000);
    await LabelScanCache.updateOne(
      { hash },
      { $set: { hash, data, expiresAt } },
      { upsert: true }
    );
  } catch {
    // Idem: si Mongo falla acá, la respuesta ya salió; sólo perdemos el ahorro.
  }
};

const analyzeLabel = async (req, res, next) => {
  // Instrumentación de latencia: nada de esto se muestra al usuario ni lleva
  // datos de la imagen/persona, sólo cuánto tardó cada etapa. Es lo que
  // permite responder "el escaneo tarda X segundos y esto es lo que los
  // consume" en vez de optimizar a ciegas.
  const t0 = process.hrtime.bigint();
  const ms = (from) => Number(process.hrtime.bigint() - from) / 1e6;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "Falta archivo de imagen" });
    }

    const tHash = process.hrtime.bigint();
    const hash = hashBuffer(req.file.buffer);
    const cached = await getCachedAnalysis(hash);
    const cacheMs = ms(tHash);
    if (cached) {
      console.info(
        `[scan] analyze cache=hit hash=${cacheMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
      );
      return res.status(200).json({ data: { ...cached, cached: true } });
    }

    // 1) Preferimos visión (Gemini): más rápido y preciso que el OCR.
    if (visionService.isVisionConfigured()) {
      const tVision = process.hrtime.bigint();
      try {
        const v = await visionService.analyzeWineLabel(req.file.buffer, req.file.mimetype);
        const visionMs = ms(tVision);
        const data = {
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
          // Lo que no cierra entre los campos leídos (uva desconocida, tipo que
          // contradice a la uva, nombre igual a la bodega). La revisión lo usa
          // para decidir qué abrir; ver data/wineValidation.js.
          issues: v.issues || [],
          source: "gemini",
          rawText: "",
          // Compat: el cliente viejo leía estas dos claves.
          estimatedName: v.displayName || "",
          estimatedVintage: v.vintage || "",
        };
        // Sólo cacheamos lecturas de Gemini (lo caro) y que sí parecen una
        // etiqueta de vino: cachear un "no es una etiqueta" o un error servido
        // como dato le devolvería lo mismo a cualquiera que suba ese archivo.
        if (v.isWineLabel !== false) saveCachedAnalysis(hash, data);
        console.info(
          `[scan] analyze cache=miss source=gemini hash=${cacheMs.toFixed(1)}ms vision=${visionMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
        );
        return res.status(200).json({ data });
      } catch (visionError) {
        // Si la visión falla (sin key, timeout, error de API), caemos al OCR.
        console.error(
          `[scan] analyze source=gemini falló tras ${ms(tVision).toFixed(1)}ms, usando OCR:`,
          visionError.message
        );
      }
    }

    // 2) Fallback: OCR local (Tesseract). Devuelve el MISMO sobre que la visión
    // para que el cliente no tenga que saber de qué camino vino: el OCR sólo
    // logra sacar nombre y año, así que el resto va vacío con confianza 0.
    const tOcr = process.hrtime.bigint();
    const result = await labelsService.analyzeImageBuffer(req.file.buffer);
    const ocrMs = ms(tOcr);
    const ocrName = result.estimatedName || "";
    const ocrConf = Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0)));

    console.info(
      `[scan] analyze cache=miss source=ocr hash=${cacheMs.toFixed(1)}ms ocr=${ocrMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
    );
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
        // El OCR no separa bodega de nombre ni lee la uva: no tiene campos
        // suficientes para que se contradigan entre sí. Los problemas que
        // importan acá los detecta la revisión sobre lo que quede al final.
        issues: [],
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
