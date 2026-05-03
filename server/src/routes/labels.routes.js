const { Router } = require("express");
const multer = require("multer");
const labelsController = require("../controllers/labels.controller");

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// POST /api/labels/analyze - multipart/form-data { file }
router.post("/analyze", upload.single("file"), labelsController.analyzeLabel);

module.exports = router;
