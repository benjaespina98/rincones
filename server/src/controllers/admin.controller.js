const ChangeLog = require("../models/changeLog.model");

const getChangeLogs = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const logs = await ChangeLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ data: logs });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getChangeLogs,
};
