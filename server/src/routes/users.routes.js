const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const { calculateAge, validateBirthDate } = require("../utils/age");
const { fail } = require("../utils/apiError");
const winesService = require("../services/wines.service");
const { validatePasswordStrength } = require("../utils/password");
const sessions = require("../services/session.service");


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
        onboarded: Boolean(user.onboardedAt),
        preferences: user.preferences || {},
        stats: user.stats || {},
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    fail(res, error, req);
  }
});

// PUT /api/users/profile - Actualizar perfil del usuario
router.put("/profile", authenticate, async (req, res) => {
  try {
    const {
      firstName, lastName, city, country, bio, avatar, birthDate,
      theme, language, notifications,
      favoriteTypes, favoriteVarietals, onboarded,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // Preferencias de gusto (onboarding) — arrays de strings, acotados.
    if (Array.isArray(favoriteTypes)) {
      user.preferences.favoriteTypes = favoriteTypes.map((t) => String(t).trim()).filter(Boolean).slice(0, 10);
    }
    if (Array.isArray(favoriteVarietals)) {
      user.preferences.favoriteVarietals = favoriteVarietals.map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
    }
    // Marca el onboarding como completado (una sola vez).
    if (onboarded === true && !user.onboardedAt) {
      user.onboardedAt = new Date();
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
        onboarded: Boolean(user.onboardedAt),
        preferences: user.preferences,
      },
    });
  } catch (error) {
    fail(res, error, req);
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

    // `.select("+passwordHash")` es imprescindible: el campo tiene select:false
    // en el schema, así que sin esto llegaba `undefined` a bcrypt.compare y el
    // endpoint tiraba 500 SIEMPRE. Cambiar la contraseña desde el perfil nunca
    // había funcionado — el 500 genérico tapaba la causa.
    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: "Contraseña actual incorrecta" });
    }

    // Este endpoint NO validaba la fortaleza: se podía pasar de una contraseña
    // fuerte a "a" desde el perfil, aunque el registro sí lo impedía.
    const fuerza = validatePasswordStrength(newPassword);
    if (!fuerza.valid) {
      return res.status(400).json({ success: false, error: fuerza.message });
    }

    user.passwordHash = await user.hashPassword(newPassword);
    user.updatedAt = new Date();
    await user.save();

    // Cambiar la contraseña cierra las sesiones abiertas en OTROS dispositivos.
    // Es la razón habitual por la que uno la cambia —sospecha de que alguien
    // más entró—, y dejarlas vivas haría que el cambio no sirviera de nada.
    // La sesión actual se renueva para no echar a quien acaba de cambiarla.
    await sessions.revokeAllForUser(user._id);
    await sessions.startSession(res, user, req);

    res.json({
      success: true,
      message: "Contraseña actualizada. Se cerraron las sesiones en otros dispositivos.",
    });
  } catch (error) {
    fail(res, error, req);
  }
});

/**
 * GET /api/users/stats — las estadísticas del usuario.
 *
 * ── POR QUÉ NO DEVUELVE `user.stats` ────────────────────────────────────────
 * Porque había DOS respuestas para la misma pregunta y salían de fuentes
 * distintas: esta ruta devolvía `user.stats`, un contador que se mantiene a mano
 * sumando y restando en ocho lugares del servicio de vinos, mientras que
 * /wines/stats/summary cuenta los vinos de verdad. Dos números para el mismo
 * hecho es un número que en algún momento va a estar mal, y encima sin fallar:
 * alcanza con que una escritura se pierda, o con que alguien agregue un camino
 * nuevo y se olvide de tocar el contador, para que empiecen a discrepar.
 *
 * Ahora las dos rutas cuentan lo mismo, contándolo. `user.stats` sigue
 * existiendo y actualizándose, pero ya no lo lee nadie: dejó de ser una
 * respuesta y pasó a ser lo que era, un caché.
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    const resumen = await winesService.getStatsSummary(req.user.id);
    res.json({
      success: true,
      data: {
        winesCount: resumen.totalWines,
        tastedWines: resumen.tastedWines,
        averageRating: resumen.averageRating,
      },
    });
  } catch (error) {
    fail(res, error, req);
  }
});

// GET /api/users/:id/wine-stats - Estadísticas derivadas de la colección de vinos del usuario
router.get("/:id/wine-stats", authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.id;

    /**
     * Sólo tus propias estadísticas.
     *
     * Acá había además un `|| req.user.isAdmin`, y era código muerto: el
     * middleware pone `id`, `email` y `role` en `req.user` — nunca `isAdmin`—,
     * así que la condición era siempre falsa y ningún admin pasó jamás por ese
     * camino. Fallaba cerrado, que es el lado bueno para equivocarse, pero la
     * línea decía que existía un permiso que no existía.
     *
     * No se "arregla" apuntando a `role`: el rol del token es el que tenías al
     * iniciar sesión, y por eso las rutas de admin usan `requireAdmin`, que lo
     * verifica contra la base. Esta ruta no lo necesita — su único llamador es
     * el dueño de las stats— así que la regla queda dicha en una sola línea.
     */
    if (req.user.id !== targetUserId) {
      return res.status(403).json({ success: false, error: "No autorizado" });
    }

    const stats = await Wine.getUserStats(targetUserId);

    res.json({ success: true, data: stats });
  } catch (error) {
    fail(res, error, req);
  }
});

module.exports = router;
