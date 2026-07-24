const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const { calculateAge, validateBirthDate } = require("../utils/age");

// GET /api/users/profile - Obtener perfil del usuario actual
router.get("/profile", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        city: user.city || "",
        country: user.country || "",
        bio: user.bio || "",
        avatar: user.avatar || "",
        birthDate: user.birthDate || null,
        age: calculateAge(user.birthDate),
        preferences: user.preferences || {},
        stats: user.stats || {},
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/users/profile - Actualizar perfil del usuario
router.put("/profile", authenticate, async (req, res) => {
  try {
    const { firstName, lastName, city, country, bio, avatar, birthDate, theme, language, notifications } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // La fecha de nacimiento se puede corregir, pero sigue validando 18+.
    if (birthDate !== undefined) {
      const birthValidation = validateBirthDate(birthDate);
      if (!birthValidation.valid) {
        return res.status(400).json({ success: false, error: birthValidation.message });
      }
      user.birthDate = birthValidation.date;
    }

    // Actualizar campos de perfil
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (city !== undefined) user.city = city.trim();
    if (country !== undefined) user.country = country.trim();
    if (bio !== undefined) user.bio = bio.trim();
    if (avatar !== undefined) user.avatar = avatar;

    // Actualizar preferencias
    if (theme !== undefined) user.preferences.theme = theme;
    if (language !== undefined) user.preferences.language = language;
    if (notifications !== undefined) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...notifications,
      };
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Perfil actualizado",
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        city: user.city,
        country: user.country,
        bio: user.bio,
        avatar: user.avatar,
        birthDate: user.birthDate || null,
        age: calculateAge(user.birthDate),
        preferences: user.preferences,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/users/password - Cambiar contraseña
router.put("/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, error: "Contraseña actual y nueva requeridas" });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // Verificar contraseña actual
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: "Contraseña actual incorrecta" });
    }

    // Actualizar contraseña
    user.passwordHash = await user.hashPassword(newPassword);
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Contraseña actualizada",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/stats - Obtener estadísticas del usuario
router.get("/stats", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    res.json({
      success: true,
      data: user.stats || {
        winesCount: 0,
        tastedWines: 0,
        averageRating: 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/:id/wine-stats - Estadísticas derivadas de la colección de vinos del usuario
router.get("/:id/wine-stats", authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.id;

    // Permisos: el usuario debe pedir sus propias stats o ser admin
    if (req.user.id !== targetUserId && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: "No autorizado" });
    }

    const stats = await Wine.getUserStats(targetUserId);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
