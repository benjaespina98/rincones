const { Router } = require("express");
const multer = require("multer");
const labelsController = require("../controllers/labels.controller");
const { authenticate, requireCuentaCompleta } = require("../middleware/auth.middleware");
const { aiLimiter, aiDailyLimiter } = require("../middleware/aiLimiter");

const router = Router();

// Sólo imágenes. Sin este filtro se aceptaba cualquier archivo de hasta 8 MB y
// se lo pasaba igual al servicio de visión, que espera una foto.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("El archivo tiene que ser una imagen"));
  },
});

// POST /api/labels/analyze - multipart/form-data { file }
//
// `authenticate` NO estaba, y era el único endpoint de la app sin protección.
// Acepta una subida y gasta cuota de Gemini Vision en cada llamada, así que
// cualquiera con la URL podía consumir el presupuesto del proyecto sin tener
// cuenta. El cliente ya mandaba el token, así que nada iba a fallar: no se iba
// a notar hasta ver la factura.
router.post("/analyze", authenticate, requireCuentaCompleta, aiLimiter, aiDailyLimiter, upload.single("file"), labelsController.analyzeLabel);

module.exports = router;
