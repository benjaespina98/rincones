const ChangeLog = require("../models/changeLog.model");
const User = require("../models/user.model");

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

// Listar todos los usuarios (solo para admins)
const getUsers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select("_id email firstName lastName role createdAt stats")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    return res.status(200).json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Cambiar rol de usuario (solo para admins)
const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: "userId y role son requeridos" });
    }

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "role debe ser 'user' o 'admin'" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    user.role = role;
    await user.save();

    return res.status(200).json({
      message: `Usuario actualizado a ${role}`,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getChangeLogs,
  getUsers,
  updateUserRole,
};
