const labelsService = require("../services/labels.service");

const analyzeLabel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Falta archivo de imagen" });
    }

    const result = await labelsService.analyzeImageBuffer(req.file.buffer);

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeLabel,
};
